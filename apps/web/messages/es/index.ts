import auth from "./auth.json";
import common from "./common.json";
import oauth from "./oauth.json";
import panel from "./panel.json";
import posts from "./posts.json";
import settings from "./settings.json";

const messages = { common, auth, oauth, ...panel, posts, settings };
export default messages;
