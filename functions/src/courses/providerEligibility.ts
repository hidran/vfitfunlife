import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { region } from "../lib/runtimeOptions";
import { db } from "./store";

export const onCourseProviderEligibility = onDocumentWritten(
  { region, document: "instructors/{providerId}" }, async (event) => {
    const provider = event.data?.after.data();
    const eligible = !!provider && provider.isActive !== false && provider.providerProfile?.isVerified === true &&
      !["pending", "rejected", "suspended"].includes(provider.applicationStatus);
    const courses = await db.collection("courses").where("providerId", "==", event.params.providerId).get();
    const changed = courses.docs.filter((doc) => doc.data().providerEligible !== eligible);
    for (let offset = 0; offset < changed.length; offset += 400) {
      const batch = db.batch();
      changed.slice(offset, offset + 400).forEach((doc) => batch.update(doc.ref, { providerEligible: eligible }));
      await batch.commit();
    }
  }
);
