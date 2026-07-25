import { FiAlertCircle, FiRefreshCw, FiHome } from 'react-icons/fi';
import { motion } from 'framer-motion';

const ErrorFallback = ({ error, errorInfo, onReset, fallback }) => {
  // Allow custom fallback UI
  if (fallback) {
    return fallback({ error, errorInfo, onReset });
  }

  const isDevelopment = import.meta.env.DEV;

  const handleGoHome = () => {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
      window.location.href = '/admin/dashboard';
    } else if (path.startsWith('/vendor')) {
      window.location.href = '/vendor/dashboard';
    } else if (path.startsWith('/delivery')) {
      window.location.href = '/delivery/dashboard';
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-8 max-w-2xl w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <FiAlertCircle className="text-4xl text-red-500" />
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
          Oops! Something went wrong
        </h1>
        <p className="text-gray-600 mb-8">
          We're sorry for the inconvenience. An unexpected error has occurred.
        </p>

        {isDevelopment && error && (
          <details className="text-left mb-6 bg-red-50 rounded-xl p-4">
            <summary className="font-semibold text-red-700 cursor-pointer mb-2">
              Error Details (Development Mode)
            </summary>
            <div className="text-sm text-red-600 font-mono overflow-auto max-h-64">
              <p className="font-bold mb-2">{error.toString()}</p>
              {errorInfo && (
                <pre className="whitespace-pre-wrap text-xs">
                  {errorInfo.componentStack}
                </pre>
              )}
            </div>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300"
          >
            <FiRefreshCw />
            Try Again
          </button>
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            <FiHome />
            Go Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// hgjhgjhbjhb

export default ErrorFallback;

