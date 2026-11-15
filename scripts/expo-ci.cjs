const fs = require('node:fs');

function identity(env) {
  const owner = env.EXPO_OWNER || '';
  const projectId = env.EXPO_PROJECT_ID || '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(owner)) {
    throw new Error('Set the EXPO_OWNER Actions repository variable to the Expo account slug.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('Set the EXPO_PROJECT_ID Actions secret to the existing EAS project UUID.');
  }
  return { EXPO_OWNER: owner, EXPO_PROJECT_ID: projectId };
}

function main(command) {
  const values = identity(process.env);
  if (command === 'prepare') {
    if (!process.env.EXPO_TOKEN) throw new Error('Set the EXPO_TOKEN Actions secret.');
    const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    const profile = eas.build.preview;
    profile.env = { ...profile.env, ...values };
    fs.writeFileSync('eas.json', JSON.stringify(eas, null, 2) + '\n');
  } else if (command === 'summary') {
    const { expo } = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    const result = JSON.parse(fs.readFileSync('eas-build.json', 'utf8'));
    const builds = Array.isArray(result) ? result : [result];
    if (!builds.length) throw new Error('EAS returned no builds.');
    for (const build of builds) {
      if (!/^[0-9a-f-]{36}$/i.test(build.id || '')) throw new Error('Invalid EAS build ID.');
      const url = `https://expo.dev/accounts/${encodeURIComponent(values.EXPO_OWNER)}/projects/${encodeURIComponent(expo.slug)}/builds/${build.id}`;
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Android build queued: ${url}\n`);
    }
  } else {
    throw new Error('Expected prepare or summary.');
  }
}

if (require.main === module) main(process.argv[2]);
module.exports = { identity };
