export function log(...args: unknown[]) { console.log(new Date().toISOString(), ...args); }
export function error(...args: unknown[]) { console.error(new Date().toISOString(), ...args); }
