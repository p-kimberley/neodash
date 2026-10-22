import type { FastifyBaseLogger, FastifyRequest } from 'fastify';

// One JSON line per security-relevant action, written to stdout alongside the normal logs.
// Filter on `audit: true` in your log pipeline (Loki, Elastic, ...).

export type AuditEvent =
  | 'auth.login'
  | 'auth.login.denied'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'access.denied'
  | 'dashboard.list'
  | 'dashboard.view'
  | 'dashboard.save'
  | 'dashboard.delete'
  | 'query'
  | 'ai.query';

export function createAuditor(log: FastifyBaseLogger) {
  const audit = log.child({ audit: true });
  return (request: FastifyRequest, event: AuditEvent, details: Record<string, unknown> = {}) => {
    const user = request.user;
    audit.info(
      {
        event,
        user: user ? { sub: user.sub, username: user.username, role: user.role } : undefined,
        authMethod: request.authMethod,
        ip: request.ip,
        requestId: request.id,
        ...details,
      },
      event
    );
  };
}

export type Auditor = ReturnType<typeof createAuditor>;
