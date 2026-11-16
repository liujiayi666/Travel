interface RunStreamControl {
  controller: AbortController;
  flushText: () => void;
}

const controlsByRunId = new Map<string, RunStreamControl>();

export const createRunStreamController = (
  runId: string,
  flushText: () => void,
): AbortController => {
  const controller = new AbortController();
  controlsByRunId.set(runId, { controller, flushText });
  return controller;
};

export const releaseRunStreamController = (runId: string, controller: AbortController) => {
  const control = controlsByRunId.get(runId);
  if (control?.controller === controller) {
    controlsByRunId.delete(runId);
  }
};

export const abortRunStream = (runId: string) => {
  controlsByRunId.get(runId)?.controller.abort();
};

export const flushRunStreamText = (runId: string) => {
  controlsByRunId.get(runId)?.flushText();
};
