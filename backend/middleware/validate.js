const { z } = require('zod');

// Whitelist of valid event names.
// Rejecting unknown event names prevents attackers from polluting the database
// with arbitrary strings and makes the schema explicit and auditable.
const ALLOWED_EVENTS = ['page_view', 'button_click', 'scroll_depth', 'session_end'];

// Properties schema: flat object (depth = 1), max 10 keys, each value max 256 chars.
// We intentionally forbid nested objects so a malicious client cannot send deeply
// nested payloads that blow up JSON parse time or storage size.
const propertiesSchema = z
  .record(
    z.string().max(64),   // key length cap
    z.union([
      z.string().max(256),
      z.number(),
      z.boolean(),
      z.null(),
    ])
  )
  .refine((obj) => Object.keys(obj).length <= 10, {
    message: 'properties must have at most 10 keys',
  })
  .optional();

const eventSchema = z.object({
  // Only lowercase letters and underscores — prevents HTML/script injection in event names
  // and keeps the whitelist check straightforward.
  event_name: z
    .string()
    .max(64)
    .regex(/^[a-z_]+$/, 'event_name must contain only a-z and _')
    .refine((v) => ALLOWED_EVENTS.includes(v), {
      message: `event_name must be one of: ${ALLOWED_EVENTS.join(', ')}`,
    }),

  // UUID v4 format enforced so session IDs are always generated client-side
  // with a standard algorithm and cannot be exploited as arbitrary string injection.
  session_id: z
    .string()
    .uuid('session_id must be a valid UUID v4'),

  // URL validation prevents free-form strings from being stored as page_url,
  // limiting the attack surface for stored XSS or log injection.
  page_url: z
    .string()
    .url('page_url must be a valid URL')
    .max(512)
    .optional(),

  properties: propertiesSchema,
});

function validate(req, res, next) {
  const result = eventSchema.safeParse(req.body);
  if (!result.success) {
    // Return structured validation errors so the client can debug,
    // but never echo back raw user input in the error message (avoid reflected injection).
    return res.status(400).json({
      success: false,
      errors: result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }
  // Attach the parsed (sanitised) data so downstream handlers never touch req.body directly.
  req.validatedData = result.data;
  next();
}

module.exports = validate;
