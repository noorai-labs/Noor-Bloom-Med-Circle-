import { verificationDay } from "../src/verification-types";

export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Env = { DB: D1Database };

const clean = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function json(request: Request) {
  let raw = "";
  const reader = request.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    const append = (chunk: string) => {
      if (raw.length + chunk.length > 20000) {
        void reader.cancel().catch(() => {});
        throw new WorkspaceError(413, "Request is too large.");
      }
      raw += chunk;
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.length; offset += 4096)
          append(
            decoder.decode(value.subarray(offset, offset + 4096), {
              stream: true,
            }),
          );
      }
      append(decoder.decode());
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Object required");
    return value as Record<string, unknown>;
  } catch {
    throw new WorkspaceError(400, "Invalid JSON.");
  }
}

/** Ensures the caller is an approved, unexpired Doctor linked to an organization. */
async function getApprovedDoctorOrg(env: Env, user: string) {
  const app = await env.DB.prepare(
    "SELECT details FROM verification_applications WHERE user_id=? AND kind='Doctor' AND status='Approved' AND valid_until>?",
  )
    .bind(user, verificationDay())
    .first<{ details: string }>();
  if (!app) {
    throw new WorkspaceError(
      403,
      "Approved doctor verification is required to browse organization workspaces.",
    );
  }
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(app.details || "{}");
  } catch {
    details = {};
  }
  const organizationId = clean(details.organizationId, 50);
  if (!organizationId) {
    throw new WorkspaceError(
      403,
      "No organization is linked to your doctor verification.",
    );
  }
  return { organizationId };
}

/** Checks if the caller is an active organization admin for the given organization. */
async function isOrgAdmin(env: Env, user: string, organizationId: string) {
  const row = await env.DB.prepare(
    "SELECT 1 FROM organization_admins WHERE user_id=? AND organization_id=? AND active=1",
  )
    .bind(user, organizationId)
    .first();
  return !!row;
}

export async function workspaceRoute(
  request: Request,
  env: Env,
  user: string,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Browse organization workspaces by name (Approved Doctors only, scoped to their org)
  if (path === "/v1/workspaces" && request.method === "GET") {
    const { organizationId } = await getApprovedDoctorOrg(env, user);
    const search = clean(url.searchParams.get("search"), 100).toLowerCase();

    let query = `
      SELECT
        wo.space_id AS spaceId,
        wo.name AS name,
        wo.organization_id AS organizationId,
        CASE WHEN m.user_id IS NOT NULL THEN 1 ELSE 0 END AS isMember,
        r.status AS requestStatus
      FROM workspace_organizations wo
      LEFT JOIN memberships m ON m.space_id = wo.space_id AND m.user_id = ?
      LEFT JOIN workspace_join_requests r ON r.space_id = wo.space_id AND r.user_id = ?
      WHERE wo.organization_id = ?
    `;
    const bindings: unknown[] = [user, user, organizationId];
    if (search) {
      query += " AND LOWER(wo.name) LIKE ?";
      bindings.push("%" + search + "%");
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null) {
      let position: unknown;
      try {
        position = JSON.parse(cursor);
      } catch {
        throw new WorkspaceError(400, "Invalid workspace cursor.");
      }
      if (
        !Array.isArray(position) ||
        position.length !== 2 ||
        position.some((value) => typeof value !== "string")
      ) {
        throw new WorkspaceError(400, "Invalid workspace cursor.");
      }
      query += " AND (wo.name, wo.space_id) > (?, ?)";
      bindings.push(...position);
    }
    query += " ORDER BY wo.name ASC, wo.space_id ASC LIMIT 51";

    const rows = await env.DB.prepare(query)
      .bind(...bindings)
      .all<{
        spaceId: string;
        name: string;
        organizationId: string;
        isMember: number;
        requestStatus: string | null;
      }>();

    const page = rows.results.slice(0, 50);
    const last = page[page.length - 1];
    return Response.json({
      nextCursor:
        rows.results.length > 50
          ? JSON.stringify([last.name, last.spaceId])
          : null,
      workspaces: page.map((r) => ({
        spaceId: r.spaceId,
        name: r.name || "Clinic Workspace",
        organizationId: r.organizationId,
        member: !!r.isMember,
        requestStatus: r.requestStatus || null,
      })),
    });
  }

  // 2. Request to join an organization workspace (Approved Doctors only)
  if (path === "/v1/workspaces/join" && request.method === "POST") {
    const { organizationId } = await getApprovedDoctorOrg(env, user);
    const input = await json(request);
    const spaceId = clean(input.spaceId, 120);
    if (!spaceId) {
      throw new WorkspaceError(400, "Select a workspace to request access.");
    }

    const ws = await env.DB.prepare(
      "SELECT space_id, organization_id FROM workspace_organizations WHERE space_id=?",
    )
      .bind(spaceId)
      .first<{ space_id: string; organization_id: string }>();
    if (!ws) {
      throw new WorkspaceError(404, "Workspace not found.");
    }
    if (ws.organization_id !== organizationId) {
      throw new WorkspaceError(
        403,
        "You can only request to join workspaces in your organization.",
      );
    }

    const existingMember = await env.DB.prepare(
      "SELECT 1 FROM memberships WHERE user_id=? AND space_id=?",
    )
      .bind(user, spaceId)
      .first();
    if (existingMember) {
      throw new WorkspaceError(
        409,
        "You are already a member of this workspace.",
      );
    }

    const existingReq = await env.DB.prepare(
      "SELECT id, status, attempt FROM workspace_join_requests WHERE user_id=? AND space_id=?",
    )
      .bind(user, spaceId)
      .first<{ id: string; status: string; attempt: number }>();

    if (existingReq) {
      if (existingReq.status === "Pending") {
        throw new WorkspaceError(
          409,
          "A join request is already pending for this workspace.",
        );
      }
      if (existingReq.status === "Approved") {
        throw new WorkspaceError(
          409,
          "Your join request has already been approved.",
        );
      }
      // Allow re-requesting after Rejection
      const reopened = await env.DB.prepare(
        "UPDATE workspace_join_requests SET status='Pending', reason='', reviewed_by='', updated_at=CURRENT_TIMESTAMP, attempt=attempt+1 WHERE id=? AND status='Rejected' AND attempt=?",
      )
        .bind(existingReq.id, existingReq.attempt)
        .run();
      if (!reopened.meta.changes)
        throw new WorkspaceError(
          409,
          "The join request changed. Refresh and try again.",
        );
      return Response.json({
        ok: true,
        request: {
          id: existingReq.id,
          spaceId,
          organizationId,
          status: "Pending",
        },
      });
    }

    const requestId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO workspace_join_requests (id, user_id, space_id, organization_id, status) VALUES (?, ?, ?, ?, 'Pending')",
      )
        .bind(requestId, user, spaceId, organizationId)
        .run();
    } catch (error) {
      const constraint =
        "UNIQUE constraint failed: workspace_join_requests.user_id, workspace_join_requests.space_id";
      if (
        error instanceof Error &&
        (error.message.includes(constraint) ||
          (error.cause instanceof Error &&
            error.cause.message.includes(constraint)))
      ) {
        throw new WorkspaceError(
          409,
          "A join request for this workspace already exists.",
        );
      }
      throw error;
    }

    return Response.json({
      ok: true,
      request: {
        id: requestId,
        spaceId,
        organizationId,
        status: "Pending",
      },
    });
  }

  // 3. List doctor's own join requests
  if (path === "/v1/workspaces/requests" && request.method === "GET") {
    await getApprovedDoctorOrg(env, user);
    const rows = await env.DB.prepare(
      `SELECT
        r.id,
        r.space_id AS spaceId,
        wo.name AS workspaceName,
        r.organization_id AS organizationId,
        r.status,
        r.reason,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt
      FROM workspace_join_requests r
      JOIN workspace_organizations wo ON wo.space_id = r.space_id
      WHERE r.user_id = ?
      ORDER BY r.updated_at DESC, r.id ASC`,
    )
      .bind(user)
      .all();
    return Response.json({ requests: rows.results });
  }

  // 4. Organization Admin: List workspace join requests for their organization
  if (path === "/v1/workspaces/admin/requests" && request.method === "GET") {
    const status = url.searchParams.get("status") || "Pending";
    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      throw new WorkspaceError(400, "Invalid request status filter.");
    }

    const orgParam = clean(url.searchParams.get("organizationId"), 50);
    const adminOrgs = (
      await env.DB.prepare(
        "SELECT organization_id FROM organization_admins WHERE user_id=? AND active=1",
      )
        .bind(user)
        .all<{ organization_id: string }>()
    ).results.map((r) => r.organization_id);

    if (!adminOrgs.length) {
      throw new WorkspaceError(403, "Organization admin access is required.");
    }
    if (orgParam && !adminOrgs.includes(orgParam)) {
      throw new WorkspaceError(
        403,
        "Organization admin access is restricted to your assigned organization.",
      );
    }

    const targetOrgs = orgParam ? [orgParam] : adminOrgs;
    const placeholders = targetOrgs.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT
        r.id,
        r.user_id AS userId,
        r.space_id AS spaceId,
        wo.name AS workspaceName,
        r.organization_id AS organizationId,
        r.status,
        r.attempt,
        r.reason,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt
      FROM workspace_join_requests r
      JOIN workspace_organizations wo ON wo.space_id = r.space_id
      WHERE r.organization_id IN (${placeholders}) AND r.status = ?
      ORDER BY r.updated_at ASC, r.id ASC
      LIMIT 50`,
    )
      .bind(...targetOrgs, status)
      .all();

    return Response.json({ requests: rows.results });
  }

  // 5. Organization Admin: Approve or Reject a workspace join request
  if (path === "/v1/workspaces/admin/review" && request.method === "POST") {
    const input = await json(request);
    const requestId = clean(input.requestId, 100);
    const decision = clean(input.decision, 20);
    const reason = clean(input.reason, 500);
    const attempt = input.attempt;

    if (!requestId || !["Approved", "Rejected"].includes(decision)) {
      throw new WorkspaceError(
        400,
        "Provide a valid request ID and decision (Approved or Rejected).",
      );
    }

    const joinReq = await env.DB.prepare(
      "SELECT id, user_id, space_id, organization_id, status, attempt FROM workspace_join_requests WHERE id=?",
    )
      .bind(requestId)
      .first<{
        id: string;
        user_id: string;
        space_id: string;
        organization_id: string;
        status: string;
        attempt: number;
      }>();

    if (!joinReq) {
      throw new WorkspaceError(404, "Join request not found.");
    }
    if (!(await isOrgAdmin(env, user, joinReq.organization_id))) {
      throw new WorkspaceError(
        403,
        "Organization admin access is required for this organization.",
      );
    }
    if (joinReq.user_id === user) {
      throw new WorkspaceError(
        403,
        "You cannot review your own workspace join request.",
      );
    }
    if (joinReq.status !== "Pending") {
      throw new WorkspaceError(
        409,
        "This join request has already been reviewed.",
      );
    }

    if (
      typeof attempt !== "number" ||
      !Number.isSafeInteger(attempt) ||
      attempt < 1
    )
      throw new WorkspaceError(400, "Provide a valid join request attempt.");
    if (joinReq.attempt !== attempt)
      throw new WorkspaceError(
        409,
        "This join request has been reopened. Refresh and review the current attempt.",
      );

    // Each subsequent statement runs only if its predecessor wrote a row.
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        "UPDATE workspace_join_requests SET status=?, reason=?, reviewed_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='Pending' AND attempt=?",
      ).bind(decision, reason, user, requestId, attempt),
      env.DB.prepare(
        "INSERT INTO security_audit(actor_id, space_id, action, target_id) SELECT ?, ?, ?, ? WHERE changes()>0",
      ).bind(
        user,
        joinReq.space_id,
        decision === "Approved"
          ? "workspace.join.approve"
          : "workspace.join.reject",
        joinReq.user_id,
      ),
    ];

    if (decision === "Approved") {
      statements.push(
        env.DB.prepare(
          "INSERT INTO memberships(user_id, space_id, role, provider_id, records_access) SELECT ?, ?, 'Doctor', ?, 0 WHERE changes()>0 ON CONFLICT(user_id,space_id) DO NOTHING",
        ).bind(joinReq.user_id, joinReq.space_id, joinReq.user_id),
      );
    }

    const res = await env.DB.batch(statements);
    if (!res[0].meta.changes) {
      throw new WorkspaceError(
        409,
        "This join request was already reviewed concurrently.",
      );
    }

    return Response.json({ ok: true, id: requestId, status: decision });
  }

  throw new WorkspaceError(404, "Workspace endpoint not found.");
}
