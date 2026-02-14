export const plugins = {
  session: {
    name: 'Session Search',
    description: 'Search session names and metadata',
  },
  project: {
    name: 'Project Search',
    description: 'Search project paths',
  },
  message: {
    name: 'Message Search',
    description: 'Search user messages and assistant replies',
  },
} as const
