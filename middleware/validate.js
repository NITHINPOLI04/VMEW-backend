/**
 * server/middleware/validate.js
 *
 * Generic Zod validation middleware factory.
 * Usage: router.post('/', validate(MySchema), handler)
 *
 * On failure: returns 400 with structured field errors.
 * On success: attaches req.body (already parsed/coerced by Zod) and calls next().
 */

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  // Replace req.body with Zod-coerced/defaulted values
  req.body = result.data;
  next();
};

module.exports = { validate };
