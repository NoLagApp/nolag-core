/**
 * The document a new project starts from.
 *
 * Kept smaller than the shipped demo on purpose: this is something to edit, so
 * every line in it should be a line someone wants to change. Tenants, type
 * grants and signing keys are all real features and all absent here, because a
 * first project does not need them and an empty-looking starter is easier to
 * read than an exhaustive one.
 */
export const STARTER_DOCUMENT = {
  version: 1,
  project: {
    name: "My project",
  },
  apps: [
    {
      slug: "chat",
      name: "Chat",
      accessMode: "open",
      topics: ["messages"],
      rooms: [{ slug: "general", name: "General" }],
    },
  ],
  actors: [
    {
      ref: "first-user",
      name: "First user",
      actorType: "user",
    },
  ],
};
