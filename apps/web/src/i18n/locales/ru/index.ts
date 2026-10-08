import desktop from "./desktop.json";
import messages from "./messages.json";

/** Everything in the web app is in messages.json; the desktop app's main process reads desktop.json on its own. */
export default { ...messages, ...desktop };
