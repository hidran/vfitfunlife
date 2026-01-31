import * as admin from "firebase-admin";
import { UserRole, Permission, RoleDefinition } from "../types";

const db = admin.firestore();

/**
 * Role definitions with default permissions
 */
export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  superadmin: {
    name: "superadmin",
    displayName: "Super Admin",
    description: "Full access to everything including user management",
    defaultPermissions: [
      "users:read",
      "users:write",
      "users:delete",
      "users:manage_roles",
      "providers:read",
      "providers:write",
      "providers:verify",
      "bookings:read",
      "bookings:write",
      "bookings:cancel",
      "bookings:confirm",
      "venues:read",
      "venues:write",
      "venues:delete",
      "services:read",
      "services:write",
      "services:delete",
      "config:read",
      "config:write",
      "reports:read",
      "content:read",
      "content:write",
      "promotions:read",
      "promotions:write",
      "financial:read",
      "financial:write",
    ],
    isStaff: true,
    canAccessAdminPanel: true,
  },
  admin: {
    name: "admin",
    displayName: "Admin",
    description: "Can manage configurations, services, venues but not user roles",
    defaultPermissions: [
      "users:read",
      "providers:read",
      "providers:write",
      "providers:verify",
      "bookings:read",
      "bookings:write",
      "bookings:cancel",
      "bookings:confirm",
      "venues:read",
      "venues:write",
      "services:read",
      "services:write",
      "config:read",
      "config:write",
      "reports:read",
      "content:read",
      "content:write",
      "promotions:read",
      "promotions:write",
      "financial:read",
    ],
    isStaff: true,
    canAccessAdminPanel: true,
  },
  provider: {
    name: "provider",
    displayName: "Provider",
    description: "Trainers, stylists, coaches who provide services",
    defaultPermissions: [
      "bookings:read",
      "services:read",
      "venues:read",
    ],
    isStaff: false,
    canAccessAdminPanel: false,
  },
  customer: {
    name: "customer",
    displayName: "Customer",
    description: "Regular users who book services",
    defaultPermissions: [
      "bookings:read",
      "bookings:write",
      "bookings:cancel",
      "services:read",
      "venues:read",
      "promotions:read",
    ],
    isStaff: false,
    canAccessAdminPanel: false,
  },
};

/**
 * Get the role definition for a given role
 * @param {UserRole} role - The user role
 * @returns {RoleDefinition} The role definition
 */
export function getRoleDefinition(role: UserRole): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}

/**
 * Get default permissions for a role
 * @param {UserRole} role - The user role
 * @returns {Permission[]} Array of permissions
 */
export function getDefaultPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_DEFINITIONS[role]?.defaultPermissions || [];
}

/**
 * Check if a role is a valid UserRole
 * @param {string} role - The role to check
 * @returns {boolean} True if valid
 */
export function isValidRole(role: string): role is UserRole {
  return Object.keys(ROLE_DEFINITIONS).includes(role);
}

/**
 * Check if a user has a specific permission
 * @param {Permission[]} userPermissions - User's permissions array
 * @param {Permission} requiredPermission - Required permission
 * @returns {boolean} True if user has permission
 */
export function hasPermission(
  userPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if a user has any of the required permissions
 * @param {Permission[]} userPermissions - User's permissions array
 * @param {Permission[]} requiredPermissions - Required permissions (any of these)
 * @returns {boolean} True if user has any of the permissions
 */
export function hasAnyPermission(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some((perm) => userPermissions.includes(perm));
}

/**
 * Check if a user has all of the required permissions
 * @param {Permission[]} userPermissions - User's permissions array
 * @param {Permission[]} requiredPermissions - Required permissions (all of these)
 * @returns {boolean} True if user has all permissions
 */
export function hasAllPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((perm) => userPermissions.includes(perm));
}

/**
 * Fetch user data with role and permissions from Firestore
 * @param {string} userId - The user ID
 * @returns {Promise<{role: UserRole, permissions: Permission[], isActive: boolean} | null>} User role info
 */
export async function getUserRoleInfo(userId: string): Promise<{
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
} | null> {
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    return null;
  }

  const userData = userDoc.data();
  if (!userData) {
    return null;
  }

  return {
    role: userData.role || "customer",
    permissions: userData.permissions || getDefaultPermissionsForRole(userData.role || "customer"),
    isActive: userData.isActive !== false, // Default to true if not set
  };
}

/**
 * Check if user has a specific role
 * @param {string} userId - The user ID
 * @param {UserRole} requiredRole - Required role
 * @returns {Promise<boolean>} True if user has the role
 */
export async function userHasRole(userId: string, requiredRole: UserRole): Promise<boolean> {
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo?.role === requiredRole;
}

/**
 * Check if user is any kind of admin (superadmin or admin)
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user is admin
 */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo?.role === "superadmin" || roleInfo?.role === "admin";
}

/**
 * Check if user is superadmin
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user is superadmin
 */
export async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo?.role === "superadmin";
}

/**
 * Check if user is a provider
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user is provider
 */
export async function checkIsProvider(userId: string): Promise<boolean> {
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo?.role === "provider";
}

/**
 * Verify user has required permission, throws error if not
 * @param {string} userId - The user ID
 * @param {Permission} permission - Required permission
 * @throws {Error} If user doesn't have permission
 */
export async function requirePermission(
  userId: string,
  permission: Permission
): Promise<void> {
  const roleInfo = await getUserRoleInfo(userId);

  if (!roleInfo) {
    throw new Error("User not found");
  }

  if (!roleInfo.isActive) {
    throw new Error("User account is deactivated");
  }

  if (!hasPermission(roleInfo.permissions, permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

/**
 * Verify user is superadmin, throws error if not
 * @param {string} userId - The user ID
 * @throws {Error} If user is not superadmin
 */
export async function requireSuperAdmin(userId: string): Promise<void> {
  const isSuperAdminUser = await checkIsSuperAdmin(userId);
  if (!isSuperAdminUser) {
    throw new Error("Superadmin access required");
  }
}

/**
 * Verify user is admin (superadmin or admin), throws error if not
 * @param {string} userId - The user ID
 * @throws {Error} If user is not admin
 */
export async function requireAdmin(userId: string): Promise<void> {
  const isAdminUser = await checkIsAdmin(userId);
  if (!isAdminUser) {
    throw new Error("Admin access required");
  }
}

/**
 * Calculate permissions based on role
 * Used when creating or updating user roles
 * @param {UserRole} role - The user role
 * @param {Permission[]} [customPermissions] - Optional custom permissions to merge
 * @returns {Permission[]} Calculated permissions
 */
export function calculatePermissions(
  role: UserRole,
  customPermissions?: Permission[]
): Permission[] {
  const defaultPerms = getDefaultPermissionsForRole(role);

  if (!customPermissions || customPermissions.length === 0) {
    return defaultPerms;
  }

  // Merge default and custom, removing duplicates
  return Array.from(new Set([...defaultPerms, ...customPermissions]));
}

/**
 * List all available roles with their definitions
 * @returns {Array<{role: UserRole, definition: RoleDefinition}>} Array of roles
 */
export function listAllRoles(): Array<{ role: UserRole; definition: RoleDefinition }> {
  return Object.entries(ROLE_DEFINITIONS).map(([role, definition]) => ({
    role: role as UserRole,
    definition,
  }));
}

/**
 * Get provider types (userTypes for providers)
 * @returns {string[]} Array of provider user types
 */
export function getProviderTypeList(): string[] {
  return [
    "trainer",
    "hairstylist",
    "yoga_teacher",
    "psychologist",
    "pronunciation_coach",
    "nutritionist",
    "massage_therapist",
    "personal_trainer",
    "pilates_instructor",
    "dance_instructor",
    "other",
  ];
}
