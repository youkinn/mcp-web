<template>
  <RouterView v-slot="{ Component }">
    <KeepAlive include="WeatherView">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>