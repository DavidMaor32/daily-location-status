import { createServerConfig } from "./config";
import { Server } from "./services/server.js";

const main = () => {
    const config = createServerConfig(process.env);
    const system = new Server(config);

    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(code => {
        process.on(code, () => {
            system.stop();
        });
    });

    system.start();
};

main();