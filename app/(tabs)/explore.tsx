import { StyleSheet, Image } from 'react-native';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import {ThemedText} from '@/components/themed-text';

export default function ExploreScreen(){
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <Image 
          source={require('@/assets/images/partial-react-logo.png')} 
          style={styles.headerImage} 
        />
      }>
      <ThemedText>Explore</ThemedText>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
});