// GET /api/users — List users (super_admin, admin only)
// POST /api/users — Create/invite user
// PATCH /api/users — Update user (role, active, department)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { canManageUsers, canCreateRole } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/auth/audit";
import type { UserRole } from "@/types";

async function getCallerProfile() {
  const sb = createServerSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return null;
  const admin = createAdminSupabase();
  const { data } = await admin.from("profiles").select("*").eq("id", session.user.id).single();
  return data;
}

export async function GET() {
  try {
    const caller = await getCallerProfile();
    if (!caller || !canManageUsers(caller.role)) {
      return apiError("No tienes permiso para ver usuarios", 403);
    }

    const sb = createAdminSupabase();
    // Exclude portal clients — they have profiles from the auth trigger
    // but are not dashboard users
    const { data, error } = await sb
      .from("profiles")
      .select("id, email, full_name, role, phone, department, is_active, last_login_at, created_at")
      .neq("role", "cliente")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return apiSuccess({ users: data || [] });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerProfile();
    if (!caller || !canManageUsers(caller.role)) {
      return apiError("No tienes permiso para crear usuarios", 403);
    }

    const { email, full_name, role, phone, department } = await request.json();
    if (!email || !full_name || !role) {
      return apiError("Email, nombre y rol son requeridos", 400);
    }

    if (!canCreateRole(caller.role as UserRole, role)) {
      return apiError(`No puedes crear usuarios con rol ${role}`, 403);
    }

    const sb = createAdminSupabase();

    // Create user via Supabase Admin API (sends invitation email)
    const { data: authUser, error: authError } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
      redirectTo: "https://api.wuipi.net/api/auth/callback",
    });
    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return apiError("Este email ya está registrado", 409);
      }
      throw authError;
    }

    // Update profile with additional fields (trigger creates basic profile)
    // Wait briefly for the trigger to create the profile, then override role
    if (authUser?.user?.id) {
      await new Promise(r => setTimeout(r, 500));
      await sb.from("profiles").update({
        full_name,
        role,
        phone: phone || null,
        department: department || null,
        created_by: caller.id,
      }).eq("id", authUser.user.id);
    }

    await logAudit({ userId: caller.id, action: "user.create", resource: "users", resourceId: authUser?.user?.id, details: { email, role } });
    return apiSuccess({ user: authUser.user }, 201);
  } catch (error) {
    return apiServerError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const caller = await getCallerProfile();
    if (!caller || !canManageUsers(caller.role)) {
      return apiError("No tienes permiso para editar usuarios", 403);
    }

    const { id, role, is_active, full_name, phone, department } = await request.json();
    if (!id) return apiError("id requerido", 400);

    // Can't edit super_admin unless you're super_admin
    const sb = createAdminSupabase();
    const { data: target } = await sb.from("profiles").select("role").eq("id", id).single();
    if (target?.role === "super_admin" && caller.role !== "super_admin") {
      return apiError("No puedes editar un Super Admin", 403);
    }

    if (role && !canCreateRole(caller.role as UserRole, role)) {
      return apiError(`No puedes asignar el rol ${role}`, 403);
    }

    const updates: Record<string, unknown> = {};
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (department !== undefined) updates.department = department;

    const { data, error } = await sb
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    await logAudit({ userId: caller.id, action: "user.update", resource: "users", resourceId: id, details: updates });
    return apiSuccess({ user: data });
  } catch (error) {
    return apiServerError(error);
  }
}
