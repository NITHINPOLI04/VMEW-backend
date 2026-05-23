const express = require('express');
const Template = require('../models/Template');
const { authenticate } = require('../middleware/authenticate');
const { letterheadSchema, defaultInfoSchema } = require('../validation/schemas');

const router = express.Router();
const TEMPLATE_TYPES = ['letterhead', 'defaultInfo'];

const templateSchemaMap = {
  letterhead: letterheadSchema,
  defaultInfo: defaultInfoSchema,
};

// GET /api/templates/:type
router.get('/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    if (!TEMPLATE_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Invalid template type' });
    }
    const template = await Template.findOne({ type, userId: req.user.userId });
    res.json(template ? template.data : null);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/templates/:type
router.put('/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    if (!TEMPLATE_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Invalid template type' });
    }

    // Validate body against the correct schema for this template type
    const schema = templateSchemaMap[type];
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parseResult.error.issues.map(i => i.message),
      });
    }
    const data = parseResult.data;

    const updatedTemplate = await Template.findOneAndUpdate(
      { type, userId: req.user.userId },
      { type, data, userId: req.user.userId },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(updatedTemplate.data);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
