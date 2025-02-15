Do the following before executing linter in sample app:

pnpm setup

# Reload shell to get new PATH

exec $SHELL

# Now link globally

pnpm link --global

# Build and try the lint command

pnpm build
cd apps/react-example
pnpm lint:perf
