const controllersByRunId = new Map<string, AbortController>();

export const createRunStreamController = (runId: string): AbortController => {
  const controller = new AbortController();
  controllersByRunId.set(runId, controller);
  return controller;
};

export const releaseRunStreamController = (runId: string, controller: AbortController) => {
  if (controllersByRunId.get(runId) === controller) {
    controllersByRunId.delete(runId);
  }
};

export const abortRunStream = (runId: string) => {
  controllersByRunId.get(runId)?.abort();
};
