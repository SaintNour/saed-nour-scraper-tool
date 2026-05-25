const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { getOpenAiStartupDiagnostics, logOpenAiKeyValidationWarnings } = require('./src/config/openaiEnv');
const { createApp } = require('./src/app');
const { startMonitoringScheduler } = require('./src/services/scheduler');
const { runDueTracks } = require('./src/services/monitoringService');

logOpenAiKeyValidationWarnings();
console.log(getOpenAiStartupDiagnostics().line);

const app = createApp();
const PORT = process.env.PORT || 3000;

startMonitoringScheduler(runDueTracks);
console.log('Watchlist automation started');

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
