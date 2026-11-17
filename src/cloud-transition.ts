import { transition, type Action, type ClinicState } from "./clinic";
export function cloudTransition(
  state: ClinicState,
  action: Action,
  operationId: string,
) {
  let count = 0;
  const next = transition(
    state,
    action,
    (prefix) => `${prefix}-${operationId}-${++count}`,
  );
  if (action.type === "book" && next.visits.length) {
    const newVisit =
      next.visits.find((v) => v.id.includes(operationId)) ||
      next.visits[next.visits.length - 1];
    newVisit.status = "Requested";
  }
  return next;
}
