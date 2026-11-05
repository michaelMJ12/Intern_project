interface LoadingStateProps {
  message?: string;
}

export function LoadingState({
  message = "Loading bills...",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="loading-state"
    >
      <span className="loader" />
      <p>{message}</p>
    </div>
  );
}
