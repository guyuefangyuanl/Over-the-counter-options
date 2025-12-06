import app from "./app";
import { env } from "./config/env";
import { log } from "./utils/logger";
const port = env.PORT;
app.listen(port, () => { log(`http://localhost:${port}`); });
