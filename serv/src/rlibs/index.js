import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const req = createRequire(import.meta.url);
const utildirn = path.dirname(fileURLToPath(import.meta.url))

const dbp = path.join(utildirn, "db");
const dbn = path.join(dbp, "db.node");
const dbinding = req(dbn);
export const { initializeDbs } = dbinding;

const ubp = path.join(utildirn, "user_handler");
const uhn = path.join(ubp, "user_handler.node");
const ubinding = req(uhn);
export const { searchUsers, addUser } = ubinding;
