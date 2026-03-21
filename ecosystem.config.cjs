const path = require('path');

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'scp-web',
      script: '/home/tlewis/bin/scp-web.sh',
      interpreter: 'bash',
    },
    {
      name: 'scp-api',
      script: '/home/tlewis/bin/scp-api.sh',
      interpreter: 'bash',
    },
    {
      name: 'scp-worker',
      script: '/home/tlewis/bin/scp-worker.sh',
      interpreter: 'bash',
    },
  ],
};
