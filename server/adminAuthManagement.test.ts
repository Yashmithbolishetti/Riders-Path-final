import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { app, resetBikeImageUploadTestDeps, setBikeImageUploadTestDeps } from './app.js';
import { db, INITIAL_SUPER_ADMIN_EMAIL } from './db.js';
import {
  extractBearerToken,
  type AuthHeaderCarrier,
  type VerifiedSupabaseAuthContext,
} from './supabase.js';

const SUPER_ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const REAL_SUPABASE_SUPER_ADMIN_UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REGULAR_ADMIN_USER_ID = '22222222-2222-4222-8222-222222222222';
const REGULAR_ADMIN_EMAIL = 'campus.ops@icfaiuniversity.in';
const STUDENT_USER_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_EMAIL = 'student@icfaiuniversity.in';

const DB_DISK_PATH = path.join(process.cwd(), 'data', 'database.json');
let initialDiskContent = '';

before(() => {
  initialDiskContent = fs.readFileSync(DB_DISK_PATH, 'utf-8');
  db.beginTestIsolation();
});

beforeEach(() => {
  db.beginTestIsolation();
});

afterEach(() => {
  try {
    resetBikeImageUploadTestDeps();
  } finally {
    db.endTestIsolation();
  }
});

after(() => {
  db.endTestIsolation();
  const afterDiskContent = fs.readFileSync(DB_DISK_PATH, 'utf-8');
  assert.equal(
    afterDiskContent,
    initialDiskContent,
    'adminAuthManagement.test.ts must never mutate data/database.json on disk'
  );
});

async function withServer(
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind test HTTP server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    resetBikeImageUploadTestDeps();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function createFakeAuthMocks() {
  const sentSetupEmails: Array<{ email: string; redirectToUrl?: string }> = [];

  const tokenDirectory = new Map<
    string,
    {
      userId: string;
      email: string;
      emailConfirmedAt: string | null;
    }
  >([
    [
      'super-admin-token',
      {
        userId: SUPER_ADMIN_USER_ID,
        email: INITIAL_SUPER_ADMIN_EMAIL,
        emailConfirmedAt: '2026-10-22T00:00:00.000Z',
      },
    ],
    [
      'unconfirmed-super-admin-token',
      {
        userId: SUPER_ADMIN_USER_ID,
        email: INITIAL_SUPER_ADMIN_EMAIL,
        emailConfirmedAt: null,
      },
    ],
    [
      'regular-admin-token',
      {
        userId: REGULAR_ADMIN_USER_ID,
        email: REGULAR_ADMIN_EMAIL,
        emailConfirmedAt: '2026-10-22T00:00:00.000Z',
      },
    ],
    [
      'student-token',
      {
        userId: STUDENT_USER_ID,
        email: STUDENT_EMAIL,
        emailConfirmedAt: '2026-10-22T00:00:00.000Z',
      },
    ],
  ]);

  const verifyBearer = async (
    reqOrHeader: AuthHeaderCarrier | string | undefined | null
  ): Promise<VerifiedSupabaseAuthContext | null> => {
    const token = extractBearerToken(reqOrHeader);
    if (!token) return null;
    const record = tokenDirectory.get(token);
    if (!record) return null;

    const mockUserClient: any = {
      auth: {
        async signOut() {
          return { error: null };
        },
      },
      async rpc(_fnName: string) {
        return { data: null, error: { message: 'RPC not mocked in unit test' } };
      },
    };

    return {
      accessToken: token,
      authUser: {
        id: record.userId,
        email: record.email,
        email_confirmed_at: record.emailConfirmedAt ?? undefined,
      } as any,
      userId: record.userId,
      email: record.email,
      emailConfirmedAt: record.emailConfirmedAt,
      userClient: mockUserClient,
    };
  };

  const dispatchAdminSetupEmail = async (
    email: string,
    redirectToUrl?: string
  ) => {
    sentSetupEmails.push({ email, redirectToUrl });
    return {
      sent: true,
      deliveryMethod: 'supabase_invite' as const,
    };
  };

  return {
    sentSetupEmails,
    verifyBearer,
    dispatchAdminSetupEmail,
  };
}

test('Initial admin constant & config hygiene: only yashmithbolishetti01@gmail.com is the initial super-admin and no passwordHash is stored in AdminConfig', () => {
  assert.equal(INITIAL_SUPER_ADMIN_EMAIL, 'yashmithbolishetti01@gmail.com');
  const config = db.getConfig() as unknown as Record<string, unknown>;
  assert.equal(
    'passwordHash' in config,
    false,
    'AdminConfig must never expose or persist a hardcoded passwordHash'
  );
});

test('Initial super-admin bootstrap protection: blocks unauthenticated users, blocks other emails, blocks unconfirmed email, succeeds once for yashmithbolishetti01@gmail.com, and blocks repeat bootstrap', async () => {
  db.resetAdminUsersForTesting([]);
  const mocks = createFakeAuthMocks();
  setBikeImageUploadTestDeps({
    verifyBearer: mocks.verifyBearer,
    dispatchAdminSetupEmail: mocks.dispatchAdminSetupEmail,
  });

  await withServer(async (baseUrl) => {
    // 0. Check bootstrap status before bootstrap
    const statusBeforeRes = await fetch(`${baseUrl}/api/admin/bootstrap/status`);
    assert.equal(statusBeforeRes.status, 200);
    const statusBefore = await statusBeforeRes.json();
    assert.equal(statusBefore.isBootstrapped, false);
    assert.equal(
      statusBefore.initialSuperAdminEmail,
      'yashmithbolishetti01@gmail.com'
    );

    // 1. Unauthenticated request cannot bootstrap
    const unauthRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
      method: 'POST',
    });
    assert.equal(unauthRes.status, 401);

    // 2. Arbitrary authenticated user (student@icfaiuniversity.in) cannot bootstrap
    const wrongUserRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer student-token' },
    });
    assert.equal(wrongUserRes.status, 403);
    const wrongUserBody = await wrongUserRes.json();
    assert.match(wrongUserBody.error, /yashmithbolishetti01@gmail\.com/);

    // 3. Unconfirmed super-admin email cannot bootstrap
    const unconfirmedRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer unconfirmed-super-admin-token' },
    });
    assert.equal(unconfirmedRes.status, 403);
    const unconfirmedBody = await unconfirmedRes.json();
    assert.match(unconfirmedBody.error, /verify your email/i);

    // 4. Send setup link endpoint rejects non-super-admin emails and passwords
    const badSetupLinkRes = await fetch(
      `${baseUrl}/api/admin/bootstrap/send-setup-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: STUDENT_EMAIL }),
      }
    );
    assert.equal(badSetupLinkRes.status, 403);

    const passwordSetupLinkRes = await fetch(
      `${baseUrl}/api/admin/bootstrap/send-setup-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: INITIAL_SUPER_ADMIN_EMAIL,
          password: 'PlaintextPassword123!',
        }),
      }
    );
    assert.equal(passwordSetupLinkRes.status, 400);

    // 5. Verified yashmithbolishetti01@gmail.com session bootstraps super_admin
    const validBootstrapRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer super-admin-token' },
    });
    assert.equal(validBootstrapRes.status, 201);
    const validBootstrapBody = await validBootstrapRes.json();
    assert.equal(validBootstrapBody.email, 'yashmithbolishetti01@gmail.com');
    assert.equal(validBootstrapBody.role, 'super_admin');
    assert.equal(validBootstrapBody.isSuperAdmin, true);

    // 6. Repeat bootstrap is rejected with 409 Conflict
    const repeatBootstrapRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
      method: 'POST',
      headers: { Authorization: 'Bearer super-admin-token' },
    });
    assert.equal(repeatBootstrapRes.status, 409);

    // 7. Bootstrap setup-link endpoint is also locked once bootstrapped
    const repeatSetupLinkRes = await fetch(
      `${baseUrl}/api/admin/bootstrap/send-setup-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: INITIAL_SUPER_ADMIN_EMAIL }),
      }
    );
    assert.equal(repeatSetupLinkRes.status, 409);
  });
});

test('Unauthorized access & Admin Management lifecycle: super_admin adds admin via setup link, regular admin cannot escalate privileges, and super_admin revokes admin access immediately', async () => {
  db.resetAdminUsersForTesting([
    {
      id: 'admin-super-1',
      userId: SUPER_ADMIN_USER_ID,
      email: INITIAL_SUPER_ADMIN_EMAIL,
      role: 'super_admin',
      status: 'active',
      addedBy: 'system_bootstrap',
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    },
  ]);

  const mocks = createFakeAuthMocks();
  setBikeImageUploadTestDeps({
    verifyBearer: mocks.verifyBearer,
    dispatchAdminSetupEmail: mocks.dispatchAdminSetupEmail,
  });

  await withServer(async (baseUrl) => {
    // 1. Unauthenticated access to admin endpoints is rejected with 401
    const unauthMe = await fetch(`${baseUrl}/api/admin/me`);
    assert.equal(unauthMe.status, 401);

    const unauthList = await fetch(`${baseUrl}/api/admin/admins`);
    assert.equal(unauthList.status, 401);

    // 2. Authenticated non-admin student is rejected with 403 on admin endpoints
    const studentMe = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: 'Bearer student-token' },
    });
    assert.equal(studentMe.status, 403);

    const studentAddAdmin = await fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer student-token',
      },
      body: JSON.stringify({ email: REGULAR_ADMIN_EMAIL }),
    });
    assert.equal(studentAddAdmin.status, 403);

    // 3. Super admin rejects any payload attempting to pass a plaintext password
    const passwordPayloadRes = await fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-admin-token',
      },
      body: JSON.stringify({
        email: REGULAR_ADMIN_EMAIL,
        password: 'PlaintextPassword123!',
      }),
    });
    assert.equal(passwordPayloadRes.status, 400);
    const passwordPayloadBody = await passwordPayloadRes.json();
    assert.match(passwordPayloadBody.error, /Do not provide a password/i);

    // 4. Super admin cannot assign role = 'super_admin' to another account
    const escalateRolePayloadRes = await fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-admin-token',
      },
      body: JSON.stringify({
        email: REGULAR_ADMIN_EMAIL,
        role: 'super_admin',
      }),
    });
    assert.equal(escalateRolePayloadRes.status, 403);

    // 5. Super admin invites a new regular admin by email
    const addAdminRes = await fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-admin-token',
      },
      body: JSON.stringify({ email: REGULAR_ADMIN_EMAIL }),
    });
    assert.equal(addAdminRes.status, 201);
    const addAdminBody = await addAdminRes.json();
    assert.equal(addAdminBody.admin.email, REGULAR_ADMIN_EMAIL);
    assert.equal(addAdminBody.admin.role, 'admin');
    assert.equal(addAdminBody.admin.status, 'invited');
    assert.equal(mocks.sentSetupEmails.length, 1);
    assert.equal(mocks.sentSetupEmails[0].email, REGULAR_ADMIN_EMAIL);

    const createdAdminId = addAdminBody.admin.id;

    // 6. Regular admin signs in -> automatically bound to user_id and activated with role 'admin'
    const regularAdminMeRes = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: 'Bearer regular-admin-token' },
    });
    assert.equal(regularAdminMeRes.status, 200);
    const regularAdminMe = await regularAdminMeRes.json();
    assert.equal(regularAdminMe.email, REGULAR_ADMIN_EMAIL);
    assert.equal(regularAdminMe.role, 'admin');
    assert.equal(regularAdminMe.isSuperAdmin, false);

    // 7. Regular admin can view administrator list, but CANNOT add, resend invite, or revoke admins (Privilege Escalation Prevention)
    const regularAdminListRes = await fetch(`${baseUrl}/api/admin/admins`, {
      headers: { Authorization: 'Bearer regular-admin-token' },
    });
    assert.equal(regularAdminListRes.status, 200);
    const regularAdminListBody = await regularAdminListRes.json();
    assert.equal(regularAdminListBody.currentAdminRole, 'admin');
    assert.equal(regularAdminListBody.isSuperAdmin, false);

    const regularAdminTryAdd = await fetch(`${baseUrl}/api/admin/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer regular-admin-token',
      },
      body: JSON.stringify({ email: 'another.admin@icfaiuniversity.in' }),
    });
    assert.equal(regularAdminTryAdd.status, 403);

    const regularAdminTryResend = await fetch(
      `${baseUrl}/api/admin/admins/${createdAdminId}/resend-invite`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer regular-admin-token' },
      }
    );
    assert.equal(regularAdminTryResend.status, 403);

    const regularAdminTryRevokeSuper = await fetch(
      `${baseUrl}/api/admin/admins/admin-super-1`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer regular-admin-token' },
      }
    );
    assert.equal(regularAdminTryRevokeSuper.status, 403);

    // 8. Regular admin cannot escalate any user's role via PUT /api/users/:id/status
    const regularAdminTryUserRole = await fetch(
      `${baseUrl}/api/users/u1/status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer regular-admin-token',
        },
        body: JSON.stringify({ role: 'super_admin' }),
      }
    );
    assert.equal(regularAdminTryUserRole.status, 403);

    // 9. Super admin cannot revoke their own initial super-admin account
    const selfRevokeRes = await fetch(
      `${baseUrl}/api/admin/admins/admin-super-1`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer super-admin-token' },
      }
    );
    assert.equal(selfRevokeRes.status, 403);

    // 10. Super admin revokes the regular admin's privileges
    const revokeRes = await fetch(
      `${baseUrl}/api/admin/admins/${createdAdminId}`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer super-admin-token' },
      }
    );
    assert.equal(revokeRes.status, 200);
    const revokeBody = await revokeRes.json();
    assert.equal(revokeBody.revokedAdmin.email, REGULAR_ADMIN_EMAIL);
    assert.equal(revokeBody.revokedAdmin.status, 'revoked');

    // 11. Revoked admin is immediately denied access on subsequent protected requests
    const revokedAdminMeRes = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: 'Bearer regular-admin-token' },
    });
    assert.equal(revokedAdminMeRes.status, 403);
  });
});

test('UID mismatch & reconciliation safety: blocks arbitrary UID rebinding, allows narrowly scoped Supabase-verified email+UID reconciliation, and never reconciles revoked records', async () => {
  // Seed a stale/test UUID on the initial super-admin record
  db.resetAdminUsersForTesting([
    {
      id: 'admin-super-1',
      userId: SUPER_ADMIN_USER_ID,
      email: INITIAL_SUPER_ADMIN_EMAIL,
      role: 'super_admin',
      status: 'active',
      addedBy: 'system_bootstrap',
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    },
    {
      id: 'admin-regular-1',
      userId: REGULAR_ADMIN_USER_ID,
      email: REGULAR_ADMIN_EMAIL,
      role: 'admin',
      status: 'active',
      addedBy: INITIAL_SUPER_ADMIN_EMAIL,
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    },
  ]);

  // 1. Arbitrary login (without independent Supabase RPC admin verification) CANNOT rebind an existing admin record to another userId
  const arbitraryRebindAttempt = db.bindOrVerifyAdminLogin(
    REAL_SUPABASE_SUPER_ADMIN_UID,
    INITIAL_SUPER_ADMIN_EMAIL,
    { allowRpcFallback: false, rpcRole: null }
  );
  assert.equal(arbitraryRebindAttempt, null);
  assert.equal(
    db.getAdminByEmail(INITIAL_SUPER_ADMIN_EMAIL)?.userId,
    SUPER_ADMIN_USER_ID,
    'Stored userId must remain unchanged after rejected arbitrary login'
  );

  // 2. Even with Supabase RPC verification, a userId already bound to ANOTHER admin email is rejected
  const crossEmailConflict = db.bindOrVerifyAdminLogin(
    REGULAR_ADMIN_USER_ID,
    INITIAL_SUPER_ADMIN_EMAIL,
    { allowRpcFallback: true, rpcRole: 'super_admin' }
  );
  assert.equal(crossEmailConflict, null);
  assert.equal(
    db.getAdminByEmail(INITIAL_SUPER_ADMIN_EMAIL)?.userId,
    SUPER_ADMIN_USER_ID
  );

  // 3. Narrowly scoped reconciliation succeeds ONLY when Supabase RPC independently verifies the authenticated (userId, email) as an admin
  const reconciled = db.bindOrVerifyAdminLogin(
    REAL_SUPABASE_SUPER_ADMIN_UID,
    INITIAL_SUPER_ADMIN_EMAIL,
    { allowRpcFallback: true, rpcRole: 'super_admin' }
  );
  assert.ok(reconciled);
  assert.equal(reconciled.userId, REAL_SUPABASE_SUPER_ADMIN_UID);
  assert.equal(reconciled.email, INITIAL_SUPER_ADMIN_EMAIL);
  assert.equal(reconciled.role, 'super_admin');
  assert.equal(reconciled.status, 'active');

  // 4. Revoked admin record is NEVER reconciled even if RPC returns true
  db.revokeAdminUser(REGULAR_ADMIN_EMAIL, INITIAL_SUPER_ADMIN_EMAIL);
  const revokedReconcileAttempt = db.bindOrVerifyAdminLogin(
    '99999999-9999-4999-8999-999999999999',
    REGULAR_ADMIN_EMAIL,
    { allowRpcFallback: true, rpcRole: 'admin' }
  );
  assert.equal(revokedReconcileAttempt, null);
  assert.equal(db.getAdminByEmail(REGULAR_ADMIN_EMAIL)?.status, 'revoked');
});

