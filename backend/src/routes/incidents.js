import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    { incident_id: '1', victim_location: '...', contact_receiver: '...' },
    { incident_id: '2', victim_location: '...', contact_receiver: '...' }
  ]);
});

export default router;
