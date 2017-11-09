import { inspect } from 'util';

const prefix = 'poesync';

const write = (method, type, ...msg) => {
  return [...msg].forEach((m) => {
    if (typeof m === 'string') {
      const messages = m.split('\n')
      .filter(s => s.length > 0)
      .forEach(k => method(`${prefix} ${type} ${k}\n`));
    } else if (typeof m === 'object') {
      method(`${prefix} ${type} ${inspect(m, false, null)}\n`);
    } else {
      method(`${prefix} ${type} ${JSON.stringify(m)}\n`);
    }
  });
};

export const log = (...msg) => {
  const info = 'INFO'.green;
  write(process.stdout.write.bind(process.stdout), info, ...msg);
};

export const error = (...msg) => {
  const err = 'ERR'.red;
  write(process.stderr.write.bind(process.stderr), err, ...msg);
};
