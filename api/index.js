const app = require('../backend/app');
const { setupTables } = require('../backend/utils/setup');

const setupPromise = setupTables().catch((e) => {
  console.warn('[setup] skipped:', e.message);
});

module.exports = async (req, res) => {
  await setupPromise;
  return app(req, res);
};
