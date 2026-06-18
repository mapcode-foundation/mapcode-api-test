import { createServerApp } from "./server";

const portArgIndex = process.argv.indexOf("--port");
const noOpen = process.argv.includes("--no-open");
const port =
  portArgIndex >= 0
    ? Number(process.argv[portArgIndex + 1])
    : process.env.PORT
      ? Number(process.env.PORT)
      : 4173;
const app = createServerApp();

app.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Mapcode API parity dashboard listening at ${url}`);
  if (!noOpen) console.log("Open the URL in your browser.");
});
