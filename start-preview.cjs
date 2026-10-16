// Support this computer and devices on the local network.
process.env.HOST ||= '0.0.0.0';
require('./server/pro/server.cjs');
