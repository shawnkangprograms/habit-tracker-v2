import {useState, useEffect} from 'react'; //useState: store data that triggers re-renders; useEffect: run code on mount
import {ThemedView} from '@/components/themed-view'; // theme-aware container component
import {ThemedText} from '@/components/themed-text'; // theme-aware text component
import {SafeAreaView} from 'react-native-safe-area-context'; 
import {getHabits} from '@/db/habits'; // fxn that reads all habits from SQLite

type Habit = { // reusable shape describing one habit, matching habits table's columns
  habitId: number;
  habitName: string;
  habitNotes: string;
};

export default function HomeScreen() { // default export, becomes the "index" tab per Expo router convention
  const [habits, setHabits] = useState<Habit[]>([]); // habits: current list in state, starts empty; setHabits: how we update it

  useEffect(() => { // runs once, when the component first mounts
    async function loadHabits(){ // inner async fxn, since useEffect's own callback can't be async
      const result = await getHabits(); // fetch all habits from SQLite (an async disk operation)
      setHabits(result); // store fetched habits in state, triggering a re-render to display them
    }
    loadHabits(); // call fxn we defined
  }, []); // empty array: only run this effect once, on mount

  return (
    <SafeAreaView>
      <ThemedView> {/* the screen's outer container */}
        <ThemedText>Home</ThemedText> {/*Simple, temporary heading untill we buil proper UI */}
        {habits.map((habit) => (
          <ThemedText key={habit.habitId}>{habit.habitName}</ThemedText>
          // key: unique identifier so React can track this item across re-renders; displays habit name
        ))}
      </ThemedView>
    </SafeAreaView>  
  );
}