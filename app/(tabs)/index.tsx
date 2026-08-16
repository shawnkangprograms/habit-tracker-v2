import {useState, useEffect} from 'react';//useState: store data that triggers re-renders; useEffect: run code on mount
import {ThemedView} from '@/components/themed-view';// theme-aware container component
import {ThemedText} from '@/components/themed-text';// theme-aware text component
import {SafeAreaView} from 'react-native-safe-area-context'; 
import {toggleCompletion, getHabitsWithTodayStatus, addHabit} from '@/db/habits';// fxn that reads all habits from SQLite

import {TextInput, TouchableOpacity} from 'react-native';

type Habit = {// reusable shape describing one habit, matching habits table's columns
  habitId: number;
  habitName: string;
  habitNotes: string;
  completionId: number;
  completed: number;
};

export default function HomeScreen() {// default export, becomes the "index" tab per Expo router convention
  const [habits, setHabits] = useState<Habit[]>([]);// habits: current list in state, starts empty; setHabits: how we update it

  const [showAddForm, setShowAddForm] = useState(false);
  const [habitName, setHabitName] = useState('');
  const [habitNotes, setHabitNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {// runs once, when the component first mounts
    
    loadHabits(); // call fxn we defined
  }, []); // empty array: only run this effect once, on mount

  async function loadHabits(){// inner async fxn, since useEffect's own callback can't be async
      const result = await getHabitsWithTodayStatus();// fetch all habits from SQLite (an async disk operation)
      setHabits(result);// store fetched habits in state, triggering a re-render to display them
  }

  const handleAddHabit = async () => {
  if (!habitName) {
  setError('Habit name required');
  return; //stop execution
   }

   setIsSaving(true); //block further taps starting now

   //completing handleAddHabit by adding try-catch which
   //1)resets form fiels 2)closes the form 3)call loadHabits() to refresh what's shown on screen
   try {
    await addHabit(habitName, habitNotes); //save to SQLite
    setHabitName(''); //clear the name field
    setHabitNotes(''); //clear the notes field
    setShowAddForm(false); //close the form
    loadHabits(); //refresh the list so the new habit shows up
   } catch (err) {
    if (err instanceof Error) {
      setError(err.message);
    } else {
      setError('An error occurred while adding the habit');
    }
   } finally {
    setIsSaving(false); // runs no matter what - success or failure - unblocking future taps
   }
  };

  return (
    <SafeAreaView>
      {/* the screen's outer container */}
      <ThemedView>

        {/*Simple, temporary heading untill we build proper UI */}
        <ThemedText>Home</ThemedText> 

          <TouchableOpacity onPress={() =>
            setShowAddForm(!showAddForm)
          }>
          <ThemedText>{showAddForm ? "Cancel" : "+"} </ThemedText>
          </TouchableOpacity>

        {showAddForm && (
          <>

          <TextInput
            value={habitName}
            onChangeText={(text) => setHabitName(text)}
          />
          <TextInput
          value={habitNotes}
          onChangeText={(text) => setHabitNotes(text)}
          />
          <TouchableOpacity disabled={isSaving} onPress={handleAddHabit}>
            <ThemedText>Save</ThemedText>
          </TouchableOpacity>
          {error ? (<ThemedText style={{color:'red', marginBottom: 12, textAlign: 'center'}}>
            {error}</ThemedText>) : null}
          </>
        )}

        
        {
          //OLD habits.map

        /*habits.map((habit) => {
          return(
          <ThemedText key={habit.habitId}>{habit.habitName}</ThemedText>
          // key: unique identifier so React can track this item across re-renders; displays habit name
        );
        })}
        */}

          {/* NEW habits.map */}
          
        {habits.map((habit) => (
          <TouchableOpacity
          key={habit.habitId}
          onPress={async () => {
            await toggleCompletion(habit.completionId, 1 - habit.completed);
            loadHabits();
          }}>
            <ThemedText>
              {habit.completed ? "yes" : "no"}{habit.habitName}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    </SafeAreaView>  
  );
}