<template>
  <div id="app" ref="app">
    <router-view />
  </div>
</template>

<script>
import Vue from "vue";
import { Component, Watch } from "vue-property-decorator";
import { Mutation, State } from "vuex-class";
import Img from "xxx";

@Component({ components: { Img } })
export default class app extends Vue {
  @Mutation("SETscreen") SETscreen;
  @State("url") url;

  @Watch("url")
  urlChange(val) {
    this.onresize();
  }

  cropperImgVal = false;

  // 监听窗口变化
  onresize() {
    let obj = {};
    obj = {
      h: window.innerHeight,
      w: window.innerWidth,
    };
    this.SETscreen(obj);
    window.onresize = null;
    // 监听窗口变化
    window.onresize = () => {
      obj = {
        h: window.innerHeight,
        w: window.innerWidth,
      };
      this.SETscreen(obj);
      obj = null;
    };
  }

  created() {}

  mounted() {
    this.onresize();
  }
}
</script>

<style lang="less">
@import "./themes/publicStyle/default.less";

#app {
  min-height: 700px;
}
</style>
