import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const req = createRequire(import.meta.url);

const bp = path.join(path.dirname(fileURLToPath(import.meta.url)), "db.node");

const binding = req(bp);

export const { timeDiff, initializeDbs, connectDb, searchUsers } = binding;
