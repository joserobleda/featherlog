import auth from "./auth.json";
import common from "./common.json";
import panel from "./panel.json";
import posts from "./posts.json";
import settings from "./settings.json";

const messages = { common, auth, ...panel, posts, settings };
export default messages;
