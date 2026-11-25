import auth from "./auth.json";
import common from "./common.json";
import newsletters from "./newsletters.json";
import oauth from "./oauth.json";
import panel from "./panel.json";
import posts from "./posts.json";
import settings from "./settings.json";

const messages = { common, auth, oauth, ...panel, newsletters, posts, settings };
export default messages;
