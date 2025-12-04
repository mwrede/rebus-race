import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';

function ArchiveDetail() {
  const { id } = useParams<{ id: string }>();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadPuzzle(id);
    }
  }, [id]);

  const loadPuzzle = async (puzzleId: string) => {
    try {
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error) throw error;
      setPuzzle(data);
    } catch (error) {
      console.error('Error loading puzzle:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading puzzle...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Puzzle Not Found</h1>
        <Link
          to="/archive"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Back to Archive
        </Link>
      </div>
    );
  }

  const puzzleDate = new Date(puzzle.date);

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4">
      <Link
        to="/archive"
        className="text-blue-600 hover:text-blue-800 mb-3 sm:mb-4 inline-block text-sm sm:text-base"
      >
        ← Back to Archive
      </Link>

      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
        Puzzle from {puzzleDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </h1>

      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mt-4 sm:mt-6">
        <div className="mb-4 sm:mb-6">
          <img
            src={puzzle.image_url}
            alt="Rebus puzzle"
            className="w-full rounded-lg border-2 border-gray-200"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <div className="text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Answer:
          </div>
          <div className="text-base sm:text-lg font-semibold text-gray-900">
            {puzzle.answer}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArchiveDetail;

