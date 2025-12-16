import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const req = createRequire(import.meta.url);
const utildirn = path.dirname(fileURLToPath(import.meta.url));

const ebp = path.join(utildirn, "napi_exports.node");
const ebinding = req(ebp);
export const {
  initDbs,
  searchUsers,
  createUser,
  deleteUser,
  checkPass,
  genJwt,
  checkJwt,
  refreshJwt,
} = ebinding;
