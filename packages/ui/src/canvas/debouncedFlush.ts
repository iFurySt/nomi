/** A trailing save with a maximum wait; callers own serial writes and errors. */
export function createDebouncedFlush(
  task: () => void,
  delay = 700,
  maxWait = 3000,
) {
  let trailing: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(trailing);
    clearTimeout(deadline);
    trailing = deadline = undefined;
  };
  const flush = () => {
    cancel();
    task();
  };
  return {
    schedule() {
      clearTimeout(trailing);
      trailing = setTimeout(flush, delay);
      deadline ??= setTimeout(flush, maxWait);
    },
    cancel,
  };
}
