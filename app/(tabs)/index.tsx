import {useState, useEffect} from 'react';//useState: store data that triggers re-renders; useEffect: run code on mount
import {ThemedView} from '@/components/themed-view';// theme-aware container component
import {ThemedText} from '@/components/themed-text';// theme-aware text component
import {SafeAreaView} from 'react-native-safe-area-context'; 
import {getHabitsWithTodayStatus, addHabit, softDeleteHabit} from '@/db/habits';// habit reads/writes in SQLite
import {toggleCompletion} from '@/db/completions';// today's completion toggle
import {getFirebaseAuth} from '@/services/authInit';// to read the signed-in user's id
import {WEEKDAY_KEYS, type Frequency, type WeekdayKey} from '@/constants/habits';

import {Alert, View, TextInput, TouchableOpacity} from 'react-native';
import {IconSymbol} from '@/components/ui/icon-symbol';

type Habit = {// one row from getHabitsWithTodayStatus: an active habit scheduled today, with today's status
  habitId: string;
  habitName: string;
  icon: string;
  frequencyType: 'daily' | 'weekdays';
  reminderTime: string | null;
  completed: number;
};

export default function HomeScreen() {// default export, becomes the "index" tab per Expo router convention
  const [habits, setHabits] = useState<Habit[]>([]);// habits: current list in state, starts empty; setHabits: how we update it

  const [showAddForm, setShowAddForm] = useState(false);
  const [habitName, setHabitName] = useState('');
  // TEMPORARY until the Add/Edit form: bare frequency controls so weekday habits can be tested
  const [isWeekdays, setIsWeekdays] = useState(false);
  const [selectedDays, setSelectedDays] = useState<WeekdayKey[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const userId = getFirebaseAuth().currentUser?.uid;// this screen is only reachable while signed in

  useEffect(() => {// runs once, when the component first mounts

    loadHabits(); // call fxn we defined
  }, []); // empty array: only run this effect once, on mount

  async function loadHabits(){// inner async fxn, since useEffect's own callback can't be async
      if (!userId) return;// no signed-in user: nothing to load
      const result = await getHabitsWithTodayStatus(userId);// active habits scheduled today, for this user
      setHabits(result as Habit[]);// store fetched habits in state, triggering a re-render to display them
  }

  // TEMPORARY until the Add/Edit form
  const toggleDay = (day: WeekdayKey) => {
    setSelectedDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
  };

  const handleAddHabit = async () => {
   setError('');
   setIsSaving(true); //block further taps starting now

   //completing handleAddHabit by adding try-catch which
   //1)resets form fiels 2)closes the form 3)call loadHabits() to refresh what's shown on screen
   try {
    const frequency: Frequency = isWeekdays ? {type: 'weekdays', days: selectedDays} : {type: 'daily'};
    // icon fixed to 'star' TEMPORARY until the Add/Edit form; addHabit validates everything
    await addHabit(userId, {habitName, icon: 'star', frequency, reminderTime: null}); //save to SQLite
    setHabitName(''); //clear the name field
    setIsWeekdays(false);
    setSelectedDays([]);
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
          {/* TEMPORARY until the Add/Edit form: bare Daily/Weekdays toggle and day picker */}
          <TouchableOpacity onPress={() => setIsWeekdays(!isWeekdays)}>
            <ThemedText>{isWeekdays ? "Weekdays" : "Daily"}</ThemedText>
          </TouchableOpacity>
          {isWeekdays && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
              {WEEKDAY_KEYS.map((day) => (
                <TouchableOpacity key={day} onPress={() => toggleDay(day)}>
                  <ThemedText>{selectedDays.includes(day) ? `[${day}] ` : `${day} `}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
          <View 
          key={habit.habitId} 
          style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>

          <TouchableOpacity
          onPress={async () => {
            try {
              await toggleCompletion(userId, habit.habitId, habit.completed === 0);
            } catch (err) {
              Alert.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
            }
            loadHabits();
          }}>
            <ThemedText>
              {habit.completed ? "yes" : "no"}{habit.habitName}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Delete Habit?",
              "Are you sure you want to delete this habit? This habit will be removed from Home.",
              [
                {text: "Cancel", style: "cancel"},
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await softDeleteHabit(userId, habit.habitId);
                    } catch (err) {
                      Alert.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
                    }
                    loadHabits();
                  }
                }
              ]
            )
          }}
          >
            <IconSymbol name="trash.fill" size={20} color="red" />
          </TouchableOpacity>
          </View>
        ))}

      </ThemedView>
    </SafeAreaView>  
  );
}