---
layout: post
title:  "Cancelling $http requests in AngularJS with our own CancelToken class"
date:   2018-12-09 13:03:42 +0100
categories: angularjs
---

Recently I needed to have the ability to cancel `$http` requests in our AngularJS app at <a href="http://jobs.labelleassiette.com">La Belle Assiette</a>. We have these large export tables, with filters, and we needed to ensure that the previous request gets canceled whenever a filter changes so that the new request results don't get overwritten by a slower, older request.

There are already a few implementations lying around on the Internet, such as [this blog post, by K. Scott Allen](https://odetocode.com/blogs/scott/archive/2014/04/24/canceling-http-requests-in-angularjs.aspx), or [this one, by Charlee Li](https://itnext.io/how-to-cancel-http-requests-in-angularjs-4ccf351319e0). However, for each implementation, I wasn't a fan of their usability, and I did not want to add more properties to the promise implementation or to modify it.

{% include note.html content="This blog post is inspired by [Charlee Li's](https://itnext.io/how-to-cancel-http-requests-in-angularjs-4ccf351319e0), and can be seen as a follow-up post. I advise you to read his post first, as the code examples are in the same mindset." %}

# Introduction

Of course, AngularJS already provides a way to cancel `$http` requests: it can take a promise as the `$timeout` parameter. Resolving this promise before the request response will cancel it. Let's look at an example:

```js
function fetchBooks() {
  const canceller = $q.defer();
  return $http.get('/api/books/', { timeout: canceller.promise });
}
```

However, in this code, you can notice we don't have access to the `canceller` promise after we have returned the `$http` promise from our `fetchBooks` function. What we can do to solve this, is to call `fetchBooks` with the promise already built:

```js
function fetchBooks(canceller) {
  return $http.get('/api/books/', { timeout: canceller.promise });
}

// Caller
const canceller = $q.defer();
const books = fetchBooks(canceller);

// Eventually cancel the promise.
canceller.resolve();
```

If you've already used [cancel token from axios](https://github.com/axios/axios#cancellation), a ReactJS HTTP library, you probably see a similarity here: we create a "token" (here represented by our promise), we "give" it to our API request, and then we can use that token to cancel the request.

However, this implementation still doesn't fully answer the need we had earlier: have only one concurrent request: if you create as many "tokens" as you create requests, you're not preventing anything to happen in parallel.

# The CancelToken class

Let me present a final implementation, wrapped in a nice AngularJS service:

```js
function CancelToken() {
  this.reset();
}

CancelToken.prototype.reset = function () {
  this._canceller = this.$q.defer();
  this.isPendingRequest = false;
};

CancelToken.prototype.activate = function () {
  this.isPendingRequest = true;
  return this._canceller.promise;
};

CancelToken.prototype.cancel = function () {
  this._canceller.resolve();
  this.reset();
};

angular
  .module('cancelTokenModule')
  .service('CancelToken', ['$q', function ($q) {
    CancelToken.prototype.$q = $q;
    return CancelToken;
  }]);
```

We now have a `CancelToken` class that we can instantiate and that will represent a request that can have at most one concurrent call. The instantiation will call the `reset` method that creates the internal promise (`_canceller`). We then modify our `fetchBooks` function as follows:

```js
function fetchBooks(cancelToken) {
  return $http.get('/api/books/', {
    timeout: cancelToken ? cancelToken.activate() : void 0,
  });
}
```

The `activate` method returns the canceller promise. We can then call `cancel` on the cancel token instance, which will resolve the promise and reset the instance, for it to be ready to be activated again.

# Full example

```js
function fetchBooks(cancelToken) {
  return $http.get('/api/books/', {
    timeout: cancelToken ? cancelToken.activate() : void 0,
  });
}

angular
  .module('books', ['cancelTokenModule'])
  .controller('BooksList', ['$scope', 'CancelToken', function ($scope, CancelToken) {
    $scope.cancelToken = new CancelToken();

    $scope.getPage = function () {
      $scope.cancelToken.cancel();
      fetchBooks($scope.cancelToken)
        .success(function (res) {
          $scope.cancelToken.reset();
          $scope.books = res.data;
        });
    };

    $scope.getPage();
  }]);
```

Above is a full code example with this new CancelToken class. Notice that we cancel the token before each request, and that we reset when a request is done so that it can be re-used right after.

## isPendingRequest

The `CancelToken` class also exposes a state `isPendingRequest`. This allows (if you expose your cancel token to `$scope`) to know if there is a pending request, to show a spinner for example:

```html
<h1>
  Books List <i ng-show="cancelToken.isPendingRequest" class="fa fa-spinner fa-spin"></i>
</h1>
```

# Conclusion

I believe this implementation is relatively simple and clean, and leaves only minimal cancellation related logic in the main controllers. Ideally, `fetchBooks` could cancel the token itself and reset it when the request is done, but I leave this as an exercise to the reader ;)

If you have any suggestion, please don't hesitate to comment!
