import { useState } from 'react';
import { setUsername } from '../lib/username';
import { supabase } from '../lib/supabase';

interface UsernamePromptProps {
  onComplete: (username: string) => void;
}

function UsernamePrompt({ onComplete }: UsernamePromptProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const checkUsernameAvailability = async (username: string): Promise<boolean> => {
    try {
      // Check if username already exists in submissions
      const { data, error } = await supabase
        .from('submissions')
        .select('username')
        .eq('username', username)
        .limit(1);

      if (error) throw error;

      // Username is available if no results found
      return !data || data.length === 0;
    } catch (error) {
      console.error('Error checking username availability:', error);
      // On error, allow the username (better UX than blocking)
      return true;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();

    if (!trimmed) {
      setError('Please enter a username');
      return;
    }

    if (trimmed.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    if (trimmed.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }

    // Check for invalid characters (alphanumeric and spaces only)
    if (!/^[a-zA-Z0-9\s]+$/.test(trimmed)) {
      setError('Username can only contain letters, numbers, and spaces');
      return;
    }

    setIsChecking(true);
    const isAvailable = await checkUsernameAvailability(trimmed);
    setIsChecking(false);

    if (!isAvailable) {
      setError('This username is already taken. Please choose another one.');
      return;
    }

    setUsername(trimmed);
    onComplete(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome to Rebus Race! 🧩
        </h2>
        <p className="text-gray-600 mb-4">
          Choose a username to track your scores on the leaderboard.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your username..."
              autoFocus
              maxLength={20}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isChecking}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isChecking ? 'Checking...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UsernamePrompt;

