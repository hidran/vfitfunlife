import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  getRemoteConfig,
  type RemoteConfigTemplate,
  type RemoteConfigParameter,
} from "firebase-admin/remote-config";
import { writeAuditLog } from "../lib/audit";
import {
  PILOT_FLAGS,
  PilotFlagValidationError,
  classifyRemoteConfigError,
  flagParameter,
  validateFlagUpdates,
  type PilotFlagKey,
  type PilotFlagValues,
} from "./pilotFlagSpec";

const region = "europe-west1";

/** Remote Config stores every value as a string, whatever its declared valueType. */
function readParam(template: RemoteConfigTemplate, key: PilotFlagKey): string {
  const param = template.parameters[key] as RemoteConfigParameter | undefined;
  const value = param?.defaultValue;
  if (value && "value" in value && typeof value.value === "string") {
    return value.value;
  }
  return PILOT_FLAGS[key].defaultValue;
}

function readAll(template: RemoteConfigTemplate): PilotFlagValues {
  return {
    pilot_mode: readParam(template, "pilot_mode") === "true",
    show_vfun: readParam(template, "show_vfun") === "true",
    show_vlife: readParam(template, "show_vlife") === "true",
    pilot_city: readParam(template, "pilot_city"),
  };
}

function templateMeta(template: RemoteConfigTemplate) {
  const version = template.version;
  return {
    versionNumber: version?.versionNumber ?? null,
    updateTime: version?.updateTime ?? null,
    updateUserEmail: version?.updateUser?.email ?? null,
  };
}

function toHttpsError(err: unknown): HttpsError {
  switch (classifyRemoteConfigError(err)) {
  case "permission":
    // A project configuration problem, not a bad request. Saying so here saves whoever
    // hits it a trip through the function logs to work that out.
    return new HttpsError(
      "permission-denied",
      "The Cloud Functions service account is missing the 'firebaseremoteconfig.admin' " +
          "permission (or the Remote Config API is disabled for this project).",
    );
  case "conflict":
    // publishTemplate sends the template ETag as If-Match. A mismatch means someone
    // published between our read and our write; clobbering it would be worse than failing.
    return new HttpsError(
      "aborted",
      "The Remote Config template changed while you were editing. Reload and try again.",
    );
  default:
    return new HttpsError("internal", err instanceof Error ? err.message : String(err));
  }
}

async function assertSuperadmin(uid: string | undefined): Promise<{ email: string }> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const snap = await getFirestore().collection("users").doc(uid).get();
  const caller = snap.data();
  if (caller?.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Superadmin required");
  }
  return { email: (caller?.email as string) ?? "" };
}

/**
 * Superadmin-only: read the LIVE template.
 *
 * The panel cannot read these through the client Remote Config SDK: that returns fetched,
 * throttled values, so a successful publish would still show the old value until the
 * client's fetch interval expired.
 */
export const getPilotFlagsAdmin = onCall({ region }, async (req) => {
  await assertSuperadmin(req.auth?.uid);
  try {
    const template = await getRemoteConfig().getTemplate();
    return { flags: readAll(template), ...templateMeta(template) };
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** Superadmin-only: publish a partial update to the whitelisted pilot flags. */
export const setPilotFlags = onCall<Partial<PilotFlagValues>>(
  { region },
  async (req) => {
    const { email } = await assertSuperadmin(req.auth?.uid);

    let keys: PilotFlagKey[];
    try {
      keys = validateFlagUpdates(req.data ?? {});
    } catch (err) {
      if (err instanceof PilotFlagValidationError) {
        throw new HttpsError("invalid-argument", err.message);
      }
      throw err;
    }
    const updates = req.data;

    try {
      const template = await getRemoteConfig().getTemplate();
      const before = readAll(template);

      for (const key of keys) {
        template.parameters[key] = flagParameter(key, updates[key] as boolean | string);
      }

      await getRemoteConfig().validateTemplate(template);
      // No { force: true }: the ETag guard is what turns a concurrent edit into a
      // failure instead of a silent overwrite of someone else's publish.
      const published = await getRemoteConfig().publishTemplate(template);
      const after = readAll(published);

      await writeAuditLog({
        actorUid: req.auth?.uid as string,
        actorEmail: email,
        actorRole: "superadmin",
        action: "update",
        entityType: "feature_flag",
        entityId: "pilot_flags",
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
        reason: "Pilot flags updated from /admin/settings",
      });

      return { flags: after, ...templateMeta(published) };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw toHttpsError(err);
    }
  },
);
