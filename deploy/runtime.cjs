// Host-mounted configuration avoids embedding credentials in image metadata.
const fs = require('node:fs');

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

const expected = ['NODE_ENV'];
let source = '/run/secrets/runtime.json';
let config;
try {
  config = JSON.parse(fs.readFileSync(source, 'utf8'));
} catch (error) {
  // JSON parser errors can include the input, so never print the original error.
  if (error.code !== 'ENOENT') fail('Cannot read or parse runtime configuration');
  source = 'container env (legacy)';
  config = Object.fromEntries(expected
    .filter((name) => Object.hasOwn(process.env, name))
    .map((name) => [name, process.env[name]]));
}
if (config === null || typeof config !== 'object' || Array.isArray(config)) {
  fail('Runtime configuration must be an object');
}
const missing = expected.filter((name) => !Object.hasOwn(config, name));
const extra = Object.keys(config).filter((name) => !expected.includes(name));
if (missing.length || extra.length) {
  fail(`Invalid runtime configuration keys (missing: ${missing.join(', ') || 'none'}; unexpected: ${extra.join(', ') || 'none'})`);
}
const nonStrings = expected.filter((name) => typeof config[name] !== 'string');
if (nonStrings.length) fail(`Runtime configuration must contain strings: ${nonStrings.join(', ')}`);
process.stderr.write(`runtime config from ${source}\n`);

// PORT is supplied per blue-green slot by the deploy tool, never by this file.
for (const [name, value] of Object.entries(config)) process.env[name] = value;
// Upstream failures may contain authenticated URLs. Redact
// credential values before either output stream reaches the host log driver.
const secrets = Object.values(config)
  .filter((value) => value.length >= 16)
  .sort((a, b) => b.length - a.length);
if (require.main === module) {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, process.argv.slice(2), {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  for (const [input, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let pending = '';
    const write = (line) => {
      for (const secret of secrets) line = line.split(secret).join('[REDACTED]');
      output.write(line);
    };
    input.setEncoding('utf8');
    input.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        write(pending.slice(0, end + 1));
        pending = pending.slice(end + 1);
      }
      // Do not retain an unbounded malformed log line or emit an unredacted fragment.
      if (pending.length > 1024 * 1024) {
        pending = '';
        output.write('[oversized log line omitted]\n');
      }
    });
    input.on('end', () => { if (pending) write(pending); });
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { process.stderr.write('Application launch failed\n'); process.exitCode = 1; });
  child.on('close', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
