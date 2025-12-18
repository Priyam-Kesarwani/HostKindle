const mongoose = require('mongoose');

const ratingSchema = mongoose.Schema({
  home: { type: mongoose.Schema.Types.ObjectId, ref: 'Home', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, required: true, min: 1, max: 5 },
}, { timestamps: true });

ratingSchema.index({ home: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
