'use strict';

var gulp = require('gulp');
var rename = require("gulp-rename");
var less = require('gulp-less');
var pleeease = require('gulp-pleeease');
var browserify = require('gulp-browserify');
var minifyJs = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var sourcemaps = require('gulp-sourcemaps');

var isProduction = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === "staging");

var paths = {
  js: {
    all: ['gulpfile.js', 'app.js', 'bin/**/*.js', 'config/**/*.js', 'data/**/*.js', 'lib/**/*.js', 'test/**/*.js'],
    entryPoints: ['public/javascript*/actions.js']
  },
  less: {
    watch: 'less/*.less',
    entryPoints: ['less/style.less'],
  },
  libs: {
    entryPoints: [
      'bower_components/bootstrap/*/glyphicons-halflings*',
    ],
  },
  target: 'public/dist/',
  ignores: ['/lib/**', 'test/**', 'public/dist']
};

// LESS compiling
gulp.task('less', function() {
  var p = gulp.src(paths.less.entryPoints)
    .pipe(sourcemaps.init());

  p = p.pipe(less());

  p = p.pipe(pleeease());
  if(isProduction) {
    p = p.pipe(minifyCss());
  }

  p = p.pipe(rename(function(path) {
    path.dirname = "css";
  }));
  p = p.pipe(sourcemaps.write('.'));
  return p.pipe(gulp.dest(paths.target));
});

// JS compiling
gulp.task('browserify', ['less'], function() {
  var p = gulp.src(paths.js.entryPoints)
    .pipe(browserify({
      debug: !isProduction,
      // No need for `__dirname`, `process`, etc in client JS
      insertGlobals: false,
      transform: ['brfs']
    }));

  if(isProduction) {
    p = p.pipe(minifyJs());
  }

  return p.pipe(gulp.dest(paths.target));
});

// Libs
gulp.task('libs', function() {
  var p = gulp.src(paths.libs.entryPoints);
  return p.pipe(gulp.dest(paths.target));
});

gulp.task('build', ['less', 'browserify', 'libs']);

// ----- Development only
if(!isProduction) {
  var nodemon = require('gulp-nodemon');
  var jshint = require('gulp-jshint');
  var livereload = require('gulp-livereload');

  var nodemonOptions = {
    script: 'bin/server',
    ext: 'js',
    env: {
      NODE_ENV: 'development'
    },
    ignore: paths.ignores
  };

  // JS linting
  gulp.task('lint', function() {
    return gulp.src(paths.js.all)
      .pipe(jshint())
      .pipe(jshint.reporter('jshint-stylish'));
  });

  // Nodemon (auto-restart node-apps)
  gulp.task('nodemon', function() {
    nodemon(nodemonOptions);
  });

  // Auto-run tasks on file changes
  gulp.task('watch', function() {
    gulp.watch(paths.js.all, ['lint']);
    gulp.watch(paths.less.watch, ['less', livereload.changed]);
  });

  gulp.task('livereload', function() {
    livereload.listen();
    gulp.watch(paths.less.watch, []);
  });

  // Run main tasks on launch
  gulp.task('default', ['lint', 'build', 'nodemon', 'watch', 'livereload'], function() {
  });
}
