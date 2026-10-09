import {useState, useCallback} from 'react';//useState: store data that triggers re-renders; useCallback: stable fxn for useFocusEffect
import {router, useFocusEffect} from 'expo-router';// navigation to the Add/Edit form; run code whenever Home gains focus
import {ThemedView} from '@/components/themed-view';// theme-aware container component
import {ThemedText} from '@/components/themed-text';// theme-aware text component
import {SafeAreaView} from 'react-native-safe-area-context';
import {getHabitsWithTodayStatus, softDeleteHabit} from '@/db/habits';// habit reads/writes in SQLite
import {toggleCompletion} from '@/db/completions';// today's completion toggle
import {getFirebaseAuth} from '@/services/authInit';// to read the signed-in user's id

import {Alert, View, TouchableOpacity} from 'react-native';
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

  const userId = getFirebaseAuth().currentUser?.uid;// this screen is only reachable while signed in

  // useCallback keeps the same fxn between renders, so the focus effect below doesn't rerun on every render
  const loadHabits = useCallback(async () => {
      if (!userId) return;// no signed-in user: nothing to load
      const result = await getHabitsWithTodayStatus(userId);// active habits scheduled today, for this user
      setHabits(result as Habit[]);// store fetched habits in state, triggering a re-render to display them
  }, [userId]);

  useFocusEffect(useCallback(() => {// runs every time Home gains focus, so adds/edits/deletes from the form show immediately
    loadHabits();
  }, [loadHabits]));

  return (
    <SafeAreaView>
      {/* the screen's outer container */}
      <ThemedView>

        {/*Simple, temporary heading untill we build proper UI */}
        <ThemedText>Home</ThemedText> 

          <TouchableOpacity onPress={() => router.push('/habit-form')}>
          <ThemedText>+</ThemedText>
          </TouchableOpacity>

        
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

          <View style={{flexDirection:'row', alignItems:'center', flex: 1}}>
          <TouchableOpacity
          hitSlop={12}
          onPress={async () => {
            try {
              await toggleCompletion(userId, habit.habitId, habit.completed === 0);
            } catch (err) {
              Alert.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
            }
            loadHabits();
          }}>
            <ThemedText>{habit.completed ? "yes" : "no"}</ThemedText>
          </TouchableOpacity>

          {/* tapping the name opens the Edit form */}
          <TouchableOpacity
          style={{flex: 1}}
          onPress={() => router.push({pathname: '/habit-form', params: {habitId: habit.habitId}})}>
            <ThemedText>{habit.habitName}</ThemedText>
          </TouchableOpacity>
          </View>

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