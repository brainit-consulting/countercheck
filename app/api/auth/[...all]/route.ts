import {toNextJsHandler} from "better-auth/next-js";
import {auth} from "../../../../lib/auth";

/**
 * Better Auth's own endpoints: requesting a magic link, following one, reading
 * and ending a session. This is the only route in the application that exists
 * for the framework rather than for the reader.
 */
export const {GET, POST} = toNextJsHandler(auth);
