import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const req = createRequire(import.meta.url);

const bp = path.join(path.dirname(fileURLToPath(import.meta.url)), "db");
const dbn = path.join(bp, "db.node");

const dbinding = req(dbn);

export const { initializeDbs, connectDb, searchUsers, addUser } = dbinding;
