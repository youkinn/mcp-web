<template>
  <RouterView v-slot="{ Component }">
    <KeepAlive include="ChatView">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
