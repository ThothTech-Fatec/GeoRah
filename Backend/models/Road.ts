// backend/models/Road.ts
import mongoose from 'mongoose';

const RoadSchema = new mongoose.Schema({
  type: { type: String, default: 'Feature' },
  properties: {
    osm_id: Number,
    name: { type: String, default: 'Estrada sem nome' },
    ref: String
  },
  geometry: {
    type: {
      type: String,
      enum: ['MultiLineString', 'LineString'],
      required: true
    },
    coordinates: {
      type: [], 
      required: true
    }
  }
});

RoadSchema.index({ geometry: '2dsphere' });

// Verifica se o modelo já existe para evitar sobrescrita em hot-reload
const RoadModel = mongoose.models.Road || mongoose.model('Road', RoadSchema);

export default RoadModel;