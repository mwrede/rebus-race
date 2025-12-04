import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';

function Archive() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [playedPuzzleIds, setPlayedPuzzleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadArchive();
    loadPlayedPuzzles();
  }, []);

  const loadArchive = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .lt('date', today) // Only get puzzles before today
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPuzzles(data || []);
    } catch (error) {
      console.error('Error loading archive:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayedPuzzles = async () => {
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) return;

      const { data, error } = await supabase
        .from('submissions')
        .select('puzzle_id')
        .eq('anon_id', anonId);

      if (error) throw error;

      const playedIds = new Set<string>(data?.map((s: { puzzle_id: string }) => s.puzzle_id) || []);
      setPlayedPuzzleIds(playedIds);
    } catch (error) {
      console.error('Error loading played puzzles:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading archive...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Puzzle Archive
      </h1>

      {puzzles.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No puzzles in the archive yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {puzzles.map((puzzle) => {
            const puzzleDate = new Date(puzzle.date);
            const day = puzzleDate.getDate();
            const month = puzzleDate.toLocaleDateString('en-US', { month: 'short' });
            const year = puzzleDate.getFullYear();
            const weekday = puzzleDate.toLocaleDateString('en-US', { weekday: 'short' });

            const isPlayed = playedPuzzleIds.has(puzzle.id);

            return (
              <Link
                key={puzzle.id}
                to={`/archive/${puzzle.id}`}
                className={`bg-gradient-to-br rounded-xl sm:rounded-2xl shadow-lg transition-all transform p-3 sm:p-4 lg:p-6 border-2 sm:border-4 ${
                  isPlayed
                    ? 'from-gray-200 to-gray-300 border-gray-400 opacity-60 cursor-not-allowed'
                    : 'from-blue-100 to-purple-100 border-blue-300 hover:shadow-xl hover:scale-105'
                }`}
              >
                <div className="text-center">
                  <div className={`text-3xl sm:text-4xl lg:text-5xl font-black mb-1 sm:mb-2 ${isPlayed ? 'text-gray-500' : 'text-blue-600'}`} style={{ fontFamily: 'Comic Sans MS, cursive' }}>
                    {day}
                  </div>
                  <div className={`text-lg sm:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-1 ${isPlayed ? 'text-gray-500' : 'text-purple-700'}`} style={{ fontFamily: 'Comic Sans MS, cursive' }}>
                    {month}
                  </div>
                  <div className={`text-sm sm:text-base lg:text-lg font-semibold mb-0.5 sm:mb-1 ${isPlayed ? 'text-gray-500' : 'text-gray-700'}`} style={{ fontFamily: 'Comic Sans MS, cursive' }}>
                    {weekday}
                  </div>
                  <div className={`text-xs sm:text-sm font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-600'}`} style={{ fontFamily: 'Comic Sans MS, cursive' }}>
                    {year}
                  </div>
                  {isPlayed && (
                    <div className="text-[10px] sm:text-xs font-bold text-gray-600 mt-1 sm:mt-2" style={{ fontFamily: 'Comic Sans MS, cursive' }}>
                      ✓ Played Already
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Archive;

