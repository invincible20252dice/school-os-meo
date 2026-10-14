import { parseLeadOperationKey } from "./google-lead-operation-key";

export const LEAD_RECOVERY_STORAGE_KEY = "school-os.google-lead-recovery.v1";
export const LEAD_RECOVERY_CHANGED = "school-os:google-lead-recovery-changed";
export const LEAD_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const LEAD_RECOVERY_ROUTE = "/dashboard/roi";
export type LeadRecoveryState = "sending" | "response_unknown" | "confirmed" | "failed";
export type LeadRecoveryScope = { userId: string; schoolId: string; route: string };
export type LeadRecoveryOperation = LeadRecoveryScope & {
  operationId: string;
  startedAt: number;
  state: LeadRecoveryState;
};
type DocumentState = {
  initialized: boolean;
  unavailable: boolean;
  scope: LeadRecoveryScope | null;
  constraints: Partial<LeadRecoveryScope>;
};
const documents = new WeakMap<Window, DocumentState>();
const fields = ["operationId", "userId", "schoolId", "route", "startedAt", "state"];
const states: LeadRecoveryState[] = ["sending", "response_unknown", "confirmed", "failed"];
const maximumOperations = 64;

function documentState(): DocumentState | null {
  if (typeof window === "undefined") return null;
  let state = documents.get(window);
  if (!state) {
    state = { initialized: false, unavailable: false, scope: null, constraints: {} };
    documents.set(window, state);
  }
  return state;
}
function notify() { window.dispatchEvent(new Event(LEAD_RECOVERY_CHANGED)); }
function unavailable(state: DocumentState) {
  state.unavailable = true;
  state.scope = null;
  notify();
}
function storage(state: DocumentState): Storage | null {
  if (state.unavailable) return null;
  try { return window.sessionStorage; } catch { unavailable(state); return null; }
}
function matches(scope: LeadRecoveryScope, constraint: Partial<LeadRecoveryScope>) {
  return Object.entries(constraint).every(([key, value]) => scope[key as keyof LeadRecoveryScope] === value);
}
function validScope(scope: LeadRecoveryScope) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(scope.userId)
    && /^[A-Za-z0-9_-]{1,128}$/.test(scope.schoolId) && scope.schoolId !== "all"
    && scope.route === LEAD_RECOVERY_ROUTE;
}
function validOperation(value: unknown): value is LeadRecoveryOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as LeadRecoveryOperation;
  return Object.keys(row).length === fields.length && fields.every((field) => Object.hasOwn(row, field))
    && typeof row.userId === "string" && typeof row.schoolId === "string" && typeof row.route === "string"
    && validScope(row) && parseLeadOperationKey(row.operationId)?.userId === row.userId
    && Number.isSafeInteger(row.startedAt) && row.startedAt > 0 && states.includes(row.state);
}
function live(row: LeadRecoveryOperation, now: number) {
  return row.startedAt <= now && now - row.startedAt < LEAD_RECOVERY_MAX_AGE_MS;
}
function write(state: DocumentState, rows: LeadRecoveryOperation[], emit = true): boolean {
  const target = storage(state);
  if (!target) return false;
  try {
    if (rows.length) target.setItem(LEAD_RECOVERY_STORAGE_KEY, JSON.stringify(rows));
    else target.removeItem(LEAD_RECOVERY_STORAGE_KEY);
    if (emit) notify();
    return true;
  } catch { unavailable(state); return false; }
}
function read(state: DocumentState): { ok: boolean; operations: LeadRecoveryOperation[] } {
  const target = storage(state);
  if (!target) return { ok: false, operations: [] };
  try {
    const raw = target.getItem(LEAD_RECOVERY_STORAGE_KEY);
    if (raw === null) return { ok: true, operations: [] };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { ok: write(state, []), operations: [] }; }
    if (!Array.isArray(parsed) || parsed.length > maximumOperations || !parsed.every(validOperation)
      || new Set(parsed.map((row) => row.operationId)).size !== parsed.length) {
      return { ok: write(state, []), operations: [] };
    }
    const operations = parsed.filter((row) => live(row, Date.now()) && matches(row, state.constraints));
    if (operations.length !== parsed.length && !write(state, operations)) return { ok: false, operations: [] };
    return { ok: true, operations };
  } catch { unavailable(state); return { ok: false, operations: [] }; }
}

/** Only a reload may restore this document's predecessor. An opener-copied tab
 * starts with navigation type "navigate" even when window.opener is unavailable. */
export function initializeLeadRecoveryDocument(): boolean {
  const state = documentState();
  if (!state) return false;
  if (!state.initialized) {
    state.initialized = true;
    let reload = false;
    try {
      const navigation = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      reload = navigation?.type === "reload";
    } catch { /* Missing navigation evidence must not restore copied state. */ }
    if (!reload) write(state, [], false);
  }
  return !state.unavailable;
}

export function readLeadRecovery(scope: LeadRecoveryScope): { ok: boolean; operations: LeadRecoveryOperation[] } {
  if (!initializeLeadRecoveryDocument()) return { ok: false, operations: [] };
  const state = documentState()!;
  if (!validScope(scope) || !matches(scope, state.constraints)) {
    return { ok: !state.unavailable, operations: [] };
  }
  state.scope = { ...scope };
  const result = read(state);
  if (!result.ok) return result;
  const operations = result.operations.filter((row) => matches(row, scope));
  if (operations.length !== result.operations.length && !write(state, operations)) return { ok: false, operations: [] };
  return { ok: true, operations };
}

/** Call readLeadRecovery for the current scope before starting a new operation. */
export function saveLeadRecovery(operation: LeadRecoveryOperation): boolean {
  if (!initializeLeadRecoveryDocument()) return false;
  const state = documentState()!;
  if (!validOperation(operation) || !live(operation, Date.now()) || !state.scope
    || !matches(operation, state.scope) || !matches(operation, state.constraints)) return false;
  const result = read(state);
  if (!result.ok || result.operations.some((row) => row.operationId === operation.operationId)
    || result.operations.length >= maximumOperations) return false;
  return write(state, [...result.operations, { ...operation }]);
}

/** A late response can update only an existing operation; cancellation never resurrects it. */
export function updateLeadRecovery(operationId: string, nextState: LeadRecoveryState, scope: LeadRecoveryScope): boolean {
  const state = documentState();
  if (!state?.scope || !matches(scope, state.scope) || !matches(scope, state.constraints)) return false;
  const result = readLeadRecovery(scope);
  if (!result.ok || !states.includes(nextState)) return false;
  const index = result.operations.findIndex((row) => row.operationId === operationId);
  if (index < 0) return false;
  const rows = result.operations.map((row, i) => i === index ? { ...row, state: nextState } : row);
  return write(documentState()!, rows);
}

export function dropLeadRecovery(operationId: string): boolean {
  if (!initializeLeadRecoveryDocument()) return false;
  const state = documentState()!;
  const result = read(state);
  if (!result.ok) return false;
  return write(state, result.operations.filter((row) => row.operationId !== operationId));
}

export function clearLeadRecovery(): boolean {
  const state = documentState();
  if (!state) return false;
  state.scope = null;
  state.initialized = true;
  // Deletion refusal invalidates memory and reports failure. It cannot prove
  // physical deletion of browser storage that the browser will not permit.
  return write(state, []);
}

/** Constraints are current browser UX context, never server authorization. */
export function pruneLeadRecovery(scope: Partial<LeadRecoveryScope> = {}): boolean {
  if (!initializeLeadRecoveryDocument()) return false;
  const state = documentState()!;
  state.constraints = { ...state.constraints, ...scope };
  if (state.scope && !matches(state.scope, state.constraints)) state.scope = null;
  return read(state).ok;
}

/** Earliest absolute deadline, used by the guard without retaining a payload. */
export function nextLeadRecoveryExpiry(): number | null {
  if (!initializeLeadRecoveryDocument()) return null;
  const result = read(documentState()!);
  if (!result.ok || !result.operations.length) return null;
  return Math.min(...result.operations.map((row) => row.startedAt + LEAD_RECOVERY_MAX_AGE_MS));
}
